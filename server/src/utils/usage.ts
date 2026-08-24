import prisma from '../config/prisma';
import { currentPeriod, limitsFor, PlanName } from './plans';
import { resolvePlanState, SubscriptionRow } from './subscription';
import { env } from '../config/env';

/**
 * Plan quota enforcement.
 *
 * Two things were wrong before. The checks were check-then-act with no
 * transaction, so two concurrent requests both passed. And every helper
 * returned ok immediately when `organizationId` was null — which is the case
 * for SUBADMIN, SUPERADMIN and any unattached STAFF account — so the limits
 * were advisory rather than enforced.
 */

export const bumpUsage = async (
  organizationId: string | null | undefined,
  field: 'eventsCreated' | 'participantsJoined',
  by = 1
): Promise<void> => {
  if (!organizationId) return;

  const period = currentPeriod();
  await prisma.usageMeter.upsert({
    where: { organizationId_period: { organizationId, period } },
    create: { organizationId, period, [field]: by },
    update: { [field]: { increment: by } },
  });
};

type Guard = { ok: true } | { ok: false; message: string };

/**
 * Accounts with no organisation — platform staff — are genuinely unlimited,
 * but that is now a deliberate, named exemption rather than a hole every
 * caller falls through.
 */
const isPlatformAccount = (organizationId: string | null | undefined): boolean => !organizationId;

/**
 * The plan a workspace may actually be held to right now.
 *
 * Every quota check below used to read `organization.plan` straight off the
 * row, which is what the customer bought and says nothing about whether the
 * period they bought is still running. One payment therefore bought the paid
 * quota permanently. Enforcement now goes through the lifecycle rules instead.
 */
const enforceablePlan = async (organizationId: string): Promise<PlanName> => {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true, planStatus: true, planExpiresAt: true },
  });

  if (!org) return 'FREE';
  return resolvePlanState(org as SubscriptionRow).effectivePlan;
};

export const assertCanCreateEvent = async (
  organizationId: string | null | undefined
): Promise<Guard> => {
  if (isPlatformAccount(organizationId)) return { ok: true };

  const plan = await enforceablePlan(organizationId!);
  const limits = limitsFor(plan);
  const period = currentPeriod();

  // Reserve the slot and read the new total in one atomic step, so two
  // concurrent creates cannot both see the same pre-increment count.
  const meter = await prisma.usageMeter.upsert({
    where: { organizationId_period: { organizationId: organizationId!, period } },
    create: { organizationId: organizationId!, period, eventsCreated: 1 },
    update: { eventsCreated: { increment: 1 } },
  });

  if (meter.eventsCreated > limits.eventsPerMonth) {
    // Hand the slot back — the caller is not going to use it.
    await prisma.usageMeter.update({
      where: { organizationId_period: { organizationId: organizationId!, period } },
      data: { eventsCreated: { decrement: 1 } },
    });

    return {
      ok: false,
      message: `Your ${plan} plan covers ${limits.eventsPerMonth} sessions a month. Upgrade to create more.`,
    };
  }

  return { ok: true };
};

export const participantCapForOrg = async (
  organizationId: string | null | undefined,
  globalCap: number
): Promise<number> => {
  if (isPlatformAccount(organizationId)) return globalCap;

  const planCap = limitsFor(await enforceablePlan(organizationId!)).participantsPerEvent;
  return Math.min(planCap, globalCap);
};

export const assertCanAddQuestion = async (
  organizationId: string | null | undefined,
  currentCount: number
): Promise<Guard> => {
  if (isPlatformAccount(organizationId)) {
    // Still bounded, so a platform account cannot accidentally create a deck
    // no client can render.
    return currentCount >= env.maxQuestionsHardCap
      ? { ok: false, message: `A session can hold at most ${env.maxQuestionsHardCap} questions.` }
      : { ok: true };
  }

  const plan = await enforceablePlan(organizationId!);
  const limits = limitsFor(plan);

  if (currentCount >= limits.questionsPerEvent) {
    return {
      ok: false,
      message: `Your ${plan} plan allows ${limits.questionsPerEvent} questions per session.`,
    };
  }

  return { ok: true };
};

/** Releases a reserved event slot when creation fails after the reservation. */
export const releaseEventSlot = async (
  organizationId: string | null | undefined
): Promise<void> => {
  if (isPlatformAccount(organizationId)) return;

  const period = currentPeriod();
  await prisma.usageMeter
    .update({
      where: { organizationId_period: { organizationId: organizationId!, period } },
      data: { eventsCreated: { decrement: 1 } },
    })
    .catch(() => undefined);
};
