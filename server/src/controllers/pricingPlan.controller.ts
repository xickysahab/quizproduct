import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { allPlans, invalidatePlanCache, PlanLimits } from '../utils/plans';
import { computeGst } from '../utils/gst';
import { seller, isGstRegistered } from '../config/seller';
import { logActivity } from '../utils/logger';
import { slog } from '../utils/slog';

/**
 * The plan catalogue, as a SuperAdmin edits it.
 *
 * The rules enforced here exist because a pricing screen is one of the few
 * places where a single careless save can break every customer at once:
 *
 * A plan is never deleted, only withdrawn. Deleting one that workspaces are on
 * would leave them pointing at a code that no longer resolves.
 *
 * A plan's code cannot change. It is written onto organisations and onto
 * invoices that have already been filed, and renaming it would silently orphan
 * both.
 *
 * Exactly one plan is the default, and it must be free. The default is what a
 * new workspace starts on and what a lapsed subscription falls back to — a
 * paid default would hand out a paid tier to everyone who signs up.
 *
 * Repricing never touches an issued invoice. Invoices carry their own amounts,
 * and a payment in flight is invoiced against the price frozen into its order.
 */

const MAX_LABEL = 60;
const MAX_BLURB = 200;
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,29}$/;

interface PlanInput {
  label?: unknown;
  blurb?: unknown;
  pricePaise?: unknown;
  eventsPerMonth?: unknown;
  participantsPerEvent?: unknown;
  questionsPerEvent?: unknown;
  branding?: unknown;
  sortOrder?: unknown;
}

/** Only the fields a SuperAdmin may set. `code`, `isActive` and `isDefault`
 *  are deliberately absent — each has its own endpoint and its own rules. */
interface PlanFields {
  label: string;
  blurb: string;
  pricePaise: number;
  eventsPerMonth: number;
  participantsPerEvent: number;
  questionsPerEvent: number;
  branding: boolean;
  sortOrder: number;
}

type Parsed = Partial<PlanFields>;

/** A whole number within range, or a reason it is not. */
const readInt = (
  value: unknown,
  field: string,
  { min, max }: { min: number; max: number }
): { ok: true; value: number } | { ok: false; message: string } => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return { ok: false, message: `${field} must be a whole number.` };
  }
  if (parsed < min || parsed > max) {
    return { ok: false, message: `${field} must be between ${min} and ${max}.` };
  }
  return { ok: true, value: parsed };
};

const parsePlanFields = (
  body: PlanInput,
  { partial }: { partial: boolean }
): { ok: true; data: Parsed } | { ok: false; message: string } => {
  const data: Parsed = {};

  const strings: [keyof PlanInput, string, number][] = [
    ['label', 'Label', MAX_LABEL],
    ['blurb', 'Description', MAX_BLURB],
  ];

  for (const [key, field, max] of strings) {
    const raw = body[key];
    if (raw === undefined) {
      if (partial) continue;
      return { ok: false, message: `${field} is required.` };
    }
    if (typeof raw !== 'string' || !raw.trim()) {
      return { ok: false, message: `${field} cannot be empty.` };
    }
    (data as Record<string, unknown>)[key as string] = raw.trim().slice(0, max);
  }

  const numbers: [keyof PlanInput, string, { min: number; max: number }][] = [
    // Ten lakh rupees a month is not a price, it is a typo. The ceiling is
    // there to catch a paise/rupees mix-up before a customer sees it.
    ['pricePaise', 'Price', { min: 0, max: 100_000_000 }],
    ['eventsPerMonth', 'Sessions per month', { min: 1, max: 1_000_000 }],
    ['participantsPerEvent', 'Participants per session', { min: 1, max: 100_000 }],
    ['questionsPerEvent', 'Questions per session', { min: 1, max: 1_000 }],
    ['sortOrder', 'Display order', { min: 0, max: 999 }],
  ];

  for (const [key, field, range] of numbers) {
    const raw = body[key];
    if (raw === undefined) {
      if (partial || key === 'sortOrder') continue;
      return { ok: false, message: `${field} is required.` };
    }
    const parsed = readInt(raw, field, range);
    if (!parsed.ok) return parsed;
    (data as Record<string, unknown>)[key as string] = parsed.value;
  }

  if (body.branding !== undefined) {
    if (typeof body.branding !== 'boolean') {
      return { ok: false, message: 'Branding must be true or false.' };
    }
    data.branding = body.branding;
  } else if (!partial) {
    data.branding = false;
  }

  return { ok: true, data };
};

/** What a plan costs a buyer once tax is added, for the admin screen. */
const withTax = (plan: PlanLimits) => {
  const treatment = isGstRegistered() ? 'GST' : 'UNREGISTERED';
  const tax = computeGst(plan.pricePaise, seller.stateCode, undefined, treatment);
  return { ...plan, priceWithTaxPaise: tax.totalPaise, taxApplies: treatment === 'GST' };
};

/**
 * Every plan, with the number of workspaces on each.
 *
 * The count is the thing that makes this screen safe to act on: withdrawing a
 * plan that nobody is on is housekeeping, and withdrawing one that 40 customers
 * are on is a decision.
 */
export const listPlansForAdmin = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const plans = await allPlans();

    const counts = await prisma.organization.groupBy({
      by: ['plan'],
      _count: { _all: true },
    });
    const byCode = new Map(counts.map((row) => [row.plan, row._count._all]));

    res.json({
      plans: plans.map((plan) => ({
        ...withTax(plan),
        organizationCount: byCode.get(plan.code) ?? 0,
      })),
    });
  } catch (error) {
    slog('error', 'plans.list_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createPlan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';

    if (!CODE_PATTERN.test(code)) {
      res.status(400).json({
        message:
          'Code must be 2–30 characters, start with a letter, and use only capitals, digits and underscores.',
      });
      return;
    }

    const existing = await prisma.pricingPlan.findUnique({ where: { code } });
    if (existing) {
      res.status(409).json({ message: `A plan with the code ${code} already exists.` });
      return;
    }

    const parsed = parsePlanFields(req.body || {}, { partial: false });
    if (!parsed.ok) {
      res.status(400).json({ message: parsed.message });
      return;
    }

    const plan = await prisma.pricingPlan.create({
      data: { code, ...(parsed.data as PlanFields) },
    });

    invalidatePlanCache();
    await logActivity(req.user!.userId, 'CREATE_PLAN', 'PricingPlan', plan.id, {
      code: plan.code,
      pricePaise: plan.pricePaise,
    });
    slog('info', 'plans.created', { code: plan.code, pricePaise: plan.pricePaise });

    res.status(201).json({ message: 'Plan created.', plan: withTax(plan as PlanLimits) });
  } catch (error) {
    slog('error', 'plans.create_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updatePlan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.pricingPlan.findUnique({ where: { id } });

    if (!existing) {
      res.status(404).json({ message: 'Plan not found.' });
      return;
    }

    // The code is written onto organisations and onto invoices already filed.
    // Changing it would orphan both, so it is refused rather than ignored.
    if (typeof req.body?.code === 'string' && req.body.code.trim().toUpperCase() !== existing.code) {
      res.status(400).json({
        message:
          "A plan's code cannot be changed — it is recorded on workspaces and on invoices that have already been issued. Create a new plan and withdraw this one instead.",
      });
      return;
    }

    const parsed = parsePlanFields(req.body || {}, { partial: true });
    if (!parsed.ok) {
      res.status(400).json({ message: parsed.message });
      return;
    }

    // The default is what a new workspace lands on. Giving it a price would
    // put every signup straight onto a paid tier for nothing.
    const nextPrice =
      typeof parsed.data.pricePaise === 'number' ? parsed.data.pricePaise : existing.pricePaise;
    if (existing.isDefault && nextPrice > 0) {
      res.status(400).json({
        message: 'The default plan must be free. Make another plan the default before pricing this one.',
      });
      return;
    }

    if (Object.keys(parsed.data).length === 0) {
      res.status(400).json({ message: 'Nothing to update.' });
      return;
    }

    const plan = await prisma.pricingPlan.update({
      where: { id },
      data: parsed.data,
    });

    invalidatePlanCache();

    // Recorded field by field: "who changed the price of Pro, from what, when"
    // is the first question anyone asks when a customer disputes a charge.
    await logActivity(req.user!.userId, 'UPDATE_PLAN', 'PricingPlan', plan.id, {
      code: plan.code,
      pricePaiseFrom: existing.pricePaise,
      pricePaiseTo: plan.pricePaise,
      changed: Object.keys(parsed.data),
    });

    if (existing.pricePaise !== plan.pricePaise) {
      slog('info', 'plans.repriced', {
        code: plan.code,
        from: existing.pricePaise,
        to: plan.pricePaise,
      });
    }

    res.json({ message: 'Plan updated.', plan: withTax(plan as PlanLimits) });
  } catch (error) {
    slog('error', 'plans.update_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Withdraws a plan from sale, or puts it back.
 *
 * Never a delete. Workspaces already on a withdrawn plan keep every limit it
 * grants — they simply cannot be joined by anyone new, and it disappears from
 * the pricing page.
 */
export const setPlanAvailability = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const isActive = req.body?.isActive;

    if (typeof isActive !== 'boolean') {
      res.status(400).json({ message: 'isActive must be true or false.' });
      return;
    }

    const existing = await prisma.pricingPlan.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ message: 'Plan not found.' });
      return;
    }

    // Withdrawing the default would leave new signups with nothing to land on.
    if (!isActive && existing.isDefault) {
      res.status(400).json({
        message: 'The default plan cannot be withdrawn. Make another plan the default first.',
      });
      return;
    }

    const plan = await prisma.pricingPlan.update({ where: { id }, data: { isActive } });
    invalidatePlanCache();

    const affected = await prisma.organization.count({ where: { plan: plan.code } });

    await logActivity(req.user!.userId, isActive ? 'RESTORE_PLAN' : 'WITHDRAW_PLAN', 'PricingPlan', plan.id, {
      code: plan.code,
      organizationsOnPlan: affected,
    });

    res.json({
      message: isActive
        ? 'Plan is on sale again.'
        : `Plan withdrawn. ${affected} workspace${affected === 1 ? '' : 's'} already on it keep it.`,
      plan: withTax(plan as PlanLimits),
    });
  } catch (error) {
    slog('error', 'plans.availability_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Moves which plan new workspaces start on.
 *
 * Done in one transaction because the database holds a partial unique index on
 * `isDefault` — two defaults is not a state it will accept, and clearing the
 * old one separately would leave a window with none at all.
 */
export const setDefaultPlan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const target = await prisma.pricingPlan.findUnique({ where: { id } });

    if (!target) {
      res.status(404).json({ message: 'Plan not found.' });
      return;
    }

    if (target.pricePaise > 0) {
      res.status(400).json({
        message: 'Only a free plan can be the default — it is what every new workspace starts on.',
      });
      return;
    }

    if (!target.isActive) {
      res.status(400).json({ message: 'A withdrawn plan cannot be the default.' });
      return;
    }

    await prisma.$transaction([
      prisma.pricingPlan.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
      prisma.pricingPlan.update({ where: { id }, data: { isDefault: true } }),
    ]);

    invalidatePlanCache();
    await logActivity(req.user!.userId, 'SET_DEFAULT_PLAN', 'PricingPlan', target.id, {
      code: target.code,
    });

    res.json({ message: `New workspaces now start on ${target.label}.` });
  } catch (error) {
    slog('error', 'plans.default_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};
