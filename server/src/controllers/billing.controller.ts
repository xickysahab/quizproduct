import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { env } from '../config/env';
import { slog } from '../utils/slog';
import { PlanName, PLAN_LIMITS, currentPeriod } from '../utils/plans';
import { createOrder, fetchOrder, fetchPayment, isRazorpayConfigured } from '../utils/razorpay';
import { nextPeriodEnd, resolvePlanState, SubscriptionRow } from '../utils/subscription';
import {
  computeGst,
  formatInvoiceNumber,
  financialYear,
  isValidGstin,
  isValidStateCode,
  stateCodeFromGstin,
  stateNameFor,
  selectableStates,
  SAC_CODE,
} from '../utils/gst';
import { verifyRazorpaySignature, verifyStripeSignature } from '../utils/webhookSignature';

/**
 * Billing.
 *
 * Razorpay is the primary rail — Stripe cannot take recurring payments from
 * most Indian customers. The Stripe path is retained and hardened rather than
 * deleted, so any existing subscription keeps working.
 */

/**
 * Records an event id, returning false if it has already been handled.
 *
 * This is the actual replay defence. A signature only proves the payload was
 * genuine once; without a consumed-events table, a captured body can be
 * replayed indefinitely to keep an organisation on a paid plan. The unique
 * constraint does the work, so two concurrent deliveries cannot both win.
 */
const consumeWebhookEvent = async (
  provider: string,
  externalId: string,
  type: string
): Promise<boolean> => {
  try {
    await prisma.webhookEvent.create({ data: { provider, externalId, type } });
    return true;
  } catch {
    slog('info', 'billing.webhook_duplicate', { provider, externalId, type });
    return false;
  }
};

interface BillingProfile {
  billingCountry: string;
  stateCode: string | null;
  gstin?: string | null;
}

/**
 * The place of supply GST should be computed against.
 *
 * Null means, and now only means, a genuine export of services. Previously a
 * null state code carried both meanings — "outside India" and "we never
 * asked" — and the second one silently took the first one's zero-rated
 * treatment.
 */
const placeOfSupply = (profile: BillingProfile): string | null =>
  profile.billingCountry === 'IN' ? profile.stateCode : null;

/** An Indian buyer with no state on file cannot be invoiced correctly. */
const missingTaxDetails = (profile: BillingProfile): boolean =>
  profile.billingCountry === 'IN' && !profile.stateCode;

/** The states a buyer may pick, for the billing form. */
export const listStates = async (_req: Request, res: Response): Promise<void> => {
  res.json({ states: selectableStates() });
};

export const listPlans = async (_req: Request, res: Response): Promise<void> => {
  res.json({
    currency: 'INR',
    gstRatePercent: 18,
    sac: SAC_CODE,
    plans: (Object.keys(PLAN_LIMITS) as PlanName[]).map((name) => {
      const plan = PLAN_LIMITS[name];
      return {
        id: name,
        label: plan.label,
        blurb: plan.blurb,
        pricePaise: plan.pricePaise,
        // Shown alongside so nobody is surprised at checkout.
        priceWithGstPaise: computeGst(plan.pricePaise, '27').totalPaise,
        eventsPerMonth: plan.eventsPerMonth,
        participantsPerEvent: plan.participantsPerEvent,
        questionsPerEvent: plan.questionsPerEvent,
        branding: plan.branding,
      };
    }),
  });
};

export const createCheckoutSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isRazorpayConfigured()) {
      res.status(501).json({
        message:
          'Payments are not configured on this server. Ask a SuperAdmin to assign a plan, or set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      });
      return;
    }

    const planName = (req.body?.plan as PlanName) || 'PRO';
    if (!['PRO', 'ENTERPRISE'].includes(planName)) {
      res.status(400).json({ message: 'Choose either the Pro or Enterprise plan.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { organizationId: true, email: true, role: true, name: true },
    });

    if (!user?.organizationId || user.role === 'STAFF') {
      res.status(403).json({ message: 'Only a tenant admin can start a subscription.' });
      return;
    }

    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        id: true,
        name: true,
        gstin: true,
        stateCode: true,
        billingCountry: true,
      },
    });

    if (!organization) {
      res.status(404).json({ message: 'Organization not found.' });
      return;
    }

    // Stop rather than guess. Charging an Indian buyer without a place of
    // supply produces an invoice that cannot be filed and a GST liability we
    // never collected — a far worse outcome than one extra form.
    if (missingTaxDetails(organization)) {
      res.status(428).json({
        message: 'Add your billing state before checking out, so the invoice carries the right GST.',
        code: 'BILLING_DETAILS_REQUIRED',
      });
      return;
    }

    const plan = PLAN_LIMITS[planName];
    const tax = computeGst(plan.pricePaise, placeOfSupply(organization));

    const order = await createOrder(tax.totalPaise, `qp_${Date.now()}`, {
      organizationId: user.organizationId,
      plan: planName,
    });

    res.json({
      provider: 'razorpay',
      keyId: env.razorpayKeyId,
      orderId: order.id,
      amountPaise: order.amount,
      currency: order.currency,
      plan: planName,
      tax,
      placeOfSupply: organization.stateCode,
      placeOfSupplyName: stateNameFor(organization.stateCode),
      organizationName: organization.name,
      prefill: { email: user.email, name: user.name },
    });
  } catch (error) {
    slog('error', 'billing.checkout_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Could not start checkout. Please try again.' });
  }
};

/**
 * The buyer's tax identity. Everything on an invoice that is not the price.
 *
 * The ordering here matters and used to be wrong. A GSTIN carries its own
 * state code in its first two digits, so when one is supplied it is
 * authoritative — the previous version derived the state from the GSTIN and
 * then let a `stateCode` field in the same request overwrite it, which is
 * exactly the disagreement the derivation was there to prevent.
 */
export const updateTaxDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { organizationId: true, role: true },
    });

    if (!user?.organizationId || (user.role !== 'TENANT' && user.role !== 'SUPERADMIN')) {
      res.status(403).json({ message: 'Only a tenant admin can update billing details.' });
      return;
    }

    const { gstin, billingName, billingAddress, stateCode, billingCountry } = req.body || {};
    const data: Record<string, string | null> = {};

    let country: string | undefined;
    if (billingCountry !== undefined) {
      const value = typeof billingCountry === 'string' ? billingCountry.trim().toUpperCase() : '';
      if (!/^[A-Z]{2}$/.test(value)) {
        res.status(400).json({ message: 'Country must be a two-letter ISO code, such as IN.' });
        return;
      }
      country = value;
      data.billingCountry = value;
    }

    // Outside India there is no GST, so a state code and a GSTIN are
    // meaningless. Clearing them keeps the invoice from claiming a place of
    // supply the buyer does not have.
    if (country && country !== 'IN') {
      data.stateCode = null;
      data.gstin = null;
    } else {
      let derivedFromGstin: string | null = null;

      if (gstin !== undefined) {
        const value = typeof gstin === 'string' ? gstin.trim().toUpperCase() : '';
        if (value && !isValidGstin(value)) {
          res.status(400).json({ message: 'That does not look like a valid 15-character GSTIN.' });
          return;
        }
        data.gstin = value || null;
        derivedFromGstin = value ? stateCodeFromGstin(value) : null;
      }

      if (derivedFromGstin) {
        // The GSTIN wins. It is the registration the invoice will be filed
        // against, so its state is the only one that can be right.
        data.stateCode = derivedFromGstin;
      } else if (typeof stateCode === 'string' && stateCode.trim()) {
        const value = stateCode.trim();
        if (!isValidStateCode(value)) {
          res.status(400).json({ message: 'Choose a valid Indian state or union territory.' });
          return;
        }
        data.stateCode = value;
      }
    }

    if (typeof billingName === 'string') data.billingName = billingName.trim().slice(0, 120) || null;
    if (typeof billingAddress === 'string') data.billingAddress = billingAddress.trim().slice(0, 400) || null;

    if (Object.keys(data).length === 0) {
      res.status(400).json({ message: 'Nothing to update.' });
      return;
    }

    const organization = await prisma.organization.update({
      where: { id: user.organizationId },
      data,
      select: {
        gstin: true,
        stateCode: true,
        billingCountry: true,
        billingName: true,
        billingAddress: true,
      },
    });

    res.json({
      message: 'Billing details updated.',
      organization: { ...organization, stateName: stateNameFor(organization.stateCode) },
      /// True while checkout would still be refused.
      incomplete: missingTaxDetails(organization),
    });
  } catch (error) {
    slog('error', 'billing.tax_details_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/** Next number in this financial year's series. */
const nextInvoiceNumber = async (): Promise<string> => {
  const year = financialYear();
  const count = await prisma.invoice.count({
    where: { invoiceNumber: { startsWith: `QP/${year}/` } },
  });
  return formatInvoiceNumber(count + 1);
};

const issueInvoice = async (
  organizationId: string,
  plan: PlanName,
  provider: string,
  providerRef: string,
  period?: { start: Date; end: Date }
) => {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { gstin: true, stateCode: true, billingCountry: true },
  });

  const tax = computeGst(
    PLAN_LIMITS[plan].pricePaise,
    organization ? placeOfSupply(organization) : null
  );

  return prisma.invoice.create({
    data: {
      organizationId,
      invoiceNumber: await nextInvoiceNumber(),
      subtotalPaise: tax.subtotalPaise,
      cgstPaise: tax.cgstPaise,
      sgstPaise: tax.sgstPaise,
      igstPaise: tax.igstPaise,
      totalPaise: tax.totalPaise,
      gstin: organization?.gstin ?? null,
      placeOfSupply: organization?.stateCode ?? null,
      provider,
      providerRef,
      plan,
      periodStart: period?.start ?? null,
      periodEnd: period?.end ?? null,
    },
  });
};

export const listInvoices = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { organizationId: true },
    });

    if (!user?.organizationId) {
      res.status(404).json({ message: 'No organization is attached to this account.' });
      return;
    }

    const invoices = await prisma.invoice.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { issuedAt: 'desc' },
      take: 100,
    });

    res.json({ invoices });
  } catch (error) {
    slog('error', 'billing.invoices_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Starts or extends a paid period.
 *
 * Returns the period so the invoice can name it. A renewal that arrives before
 * the current period ends extends from the existing expiry rather than from
 * today — see nextPeriodEnd — so paying early never costs the customer days.
 */
const activatePlan = async (
  organizationId: string,
  plan: PlanName,
  months = 1
): Promise<{ start: Date; end: Date }> => {
  const now = new Date();
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { planExpiresAt: true },
  });

  const end = nextPeriodEnd(organization?.planExpiresAt ?? null, now, months);

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      plan,
      planStatus: 'ACTIVE',
      planStartedAt: now,
      planExpiresAt: end,
      planCancelledAt: null,
    },
  });

  return { start: now, end };
};

/** Drops a workspace back to the free tier and records why. */
const lapsePlan = async (organizationId: string) => {
  await prisma.organization.update({
    where: { id: organizationId },
    data: { plan: 'FREE', planStatus: 'EXPIRED', planCancelledAt: new Date() },
  });
};

export const razorpayWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!env.razorpayWebhookSecret) {
      res.status(501).json({ message: 'Razorpay webhooks are not configured.' });
      return;
    }

    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ message: 'Invalid webhook payload.' });
      return;
    }

    const verified = verifyRazorpaySignature(
      req.body,
      req.header('x-razorpay-signature'),
      env.razorpayWebhookSecret
    );

    if (!verified.ok) {
      slog('warn', 'billing.razorpay_signature_rejected', { reason: verified.reason });
      res.status(400).json({ message: 'Invalid signature.' });
      return;
    }

    const event = JSON.parse(req.body.toString('utf8')) as {
      event: string;
      payload?: {
        payment?: { entity?: { id?: string; order_id?: string; notes?: Record<string, string> } };
      };
    };

    const entity = event.payload?.payment?.entity;
    const externalId = entity?.id;

    if (!externalId) {
      // Nothing to deduplicate on; acknowledge so Razorpay stops retrying.
      res.json({ received: true, ignored: true });
      return;
    }

    if (!(await consumeWebhookEvent('razorpay', externalId, event.event))) {
      res.json({ received: true, duplicate: true });
      return;
    }

    const organizationId = entity?.notes?.organizationId;
    const plan = (entity?.notes?.plan as PlanName) || 'PRO';

    if (organizationId && (event.event === 'payment.captured' || event.event === 'order.paid')) {
      const period = await activatePlan(organizationId, plan);
      await issueInvoice(organizationId, plan, 'razorpay', externalId, period);
      slog('info', 'billing.plan_activated', {
        organizationId,
        plan,
        provider: 'razorpay',
        periodEnd: period.end.toISOString(),
      });
    }

    res.json({ received: true });
  } catch (error) {
    slog('error', 'billing.razorpay_webhook_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const stripeWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!env.stripeWebhookSecret) {
      res.status(501).json({ message: 'Stripe webhooks are not configured.' });
      return;
    }

    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ message: 'Invalid webhook payload.' });
      return;
    }

    // Now checks the timestamp against a tolerance window and compares digests
    // in constant time — neither of which the previous version did.
    const verified = verifyStripeSignature(
      req.body,
      req.header('stripe-signature'),
      env.stripeWebhookSecret
    );

    if (!verified.ok) {
      slog('warn', 'billing.stripe_signature_rejected', { reason: verified.reason });
      res.status(400).json({ message: 'Invalid signature.' });
      return;
    }

    const event = JSON.parse(req.body.toString('utf8')) as {
      id?: string;
      type: string;
      data: { object: { client_reference_id?: string; metadata?: { organizationId?: string } } };
    };

    if (event.id && !(await consumeWebhookEvent('stripe', event.id, event.type))) {
      res.json({ received: true, duplicate: true });
      return;
    }

    const organizationId =
      event.data.object.metadata?.organizationId || event.data.object.client_reference_id;

    if (organizationId && (event.type === 'checkout.session.completed' || event.type === 'invoice.paid')) {
      const period = await activatePlan(organizationId, 'PRO');
      await issueInvoice(organizationId, 'PRO', 'stripe', event.id || 'unknown', period);
    }

    // A failed invoice no longer downgrades immediately. Stripe retries for
    // days, so cutting a paying customer off mid-event on the first failure is
    // the wrong response — only an actually cancelled subscription downgrades.
    if (organizationId && event.type === 'customer.subscription.deleted') {
      await lapsePlan(organizationId);
    }

    res.json({ received: true });
  } catch (error) {
    slog('error', 'billing.webhook_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Confirms a payment straight from the client, as a fallback if the webhook is
 * slow — which it routinely is, and a customer staring at a spinner after
 * paying will not wait for it.
 *
 * Two things this must not do, both of which it used to. It must not trust the
 * caller about which workspace was paid for: the previous version upgraded
 * *the caller's* organisation on the strength of any captured payment id, so
 * one shared id upgraded any account that pasted it. And it must not assume
 * the plan — it hardcoded PRO, so an ENTERPRISE payment bought a PRO
 * workspace. Both are settled by reading the order this payment belongs to,
 * whose notes we wrote ourselves at checkout.
 */
export const confirmPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const paymentId = typeof req.body?.paymentId === 'string' ? req.body.paymentId : '';
    if (!paymentId) {
      res.status(400).json({ message: 'A payment id is required.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { organizationId: true },
    });

    if (!user?.organizationId) {
      res.status(403).json({ message: 'No organization is attached to this account.' });
      return;
    }

    // Verified against Razorpay rather than trusted from the client — the
    // client saying "I paid" is not evidence of payment.
    const payment = await fetchPayment(paymentId);

    if (payment.status !== 'captured') {
      res.status(400).json({ message: 'That payment has not completed yet.' });
      return;
    }

    if (!payment.order_id) {
      res.status(400).json({ message: 'That payment is not attached to an order.' });
      return;
    }

    const order = await fetchOrder(payment.order_id);
    const paidForOrganizationId = order.notes?.organizationId;
    const paidPlan = order.notes?.plan as PlanName | undefined;

    // The order was created by this server for one specific workspace. If the
    // caller is not that workspace, this is someone else's receipt.
    if (!paidForOrganizationId || paidForOrganizationId !== user.organizationId) {
      slog('warn', 'billing.confirm_org_mismatch', {
        organizationId: user.organizationId,
        paidForOrganizationId: paidForOrganizationId ?? null,
        paymentId,
      });
      res.status(403).json({ message: 'That payment belongs to a different workspace.' });
      return;
    }

    if (!paidPlan || !PLAN_LIMITS[paidPlan] || paidPlan === 'FREE') {
      res.status(400).json({ message: 'That payment is not for a subscription plan.' });
      return;
    }

    if (!(await consumeWebhookEvent('razorpay', payment.id, 'client.confirm'))) {
      // The webhook almost certainly won the race. Report the plan as it now
      // stands rather than as an error — from the customer's side it worked.
      const organization = await prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { plan: true, planStatus: true, planExpiresAt: true },
      });

      res.json({
        message: 'Payment already applied.',
        duplicate: true,
        subscription: organization ? resolvePlanState(organization as SubscriptionRow) : null,
      });
      return;
    }

    const period = await activatePlan(user.organizationId, paidPlan);
    const invoice = await issueInvoice(
      user.organizationId,
      paidPlan,
      'razorpay',
      payment.id,
      period
    );

    slog('info', 'billing.plan_activated', {
      organizationId: user.organizationId,
      plan: paidPlan,
      provider: 'razorpay',
      via: 'client.confirm',
      periodEnd: period.end.toISOString(),
    });

    res.json({
      message: 'Payment confirmed.',
      plan: paidPlan,
      periodEnd: period.end,
      invoice,
    });
  } catch (error) {
    slog('error', 'billing.confirm_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Could not confirm that payment.' });
  }
};

/**
 * The workspace's subscription as the billing page needs to render it.
 *
 * Separate from GET /org/me because that endpoint is read on nearly every
 * page load, and this one exists to answer "when does this run out".
 */
export const getSubscription = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { organizationId: true },
    });

    if (!user?.organizationId) {
      res.status(404).json({ message: 'No organization is attached to this account.' });
      return;
    }

    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        plan: true,
        planStatus: true,
        planStartedAt: true,
        planExpiresAt: true,
        gstin: true,
        stateCode: true,
        billingCountry: true,
        billingName: true,
        billingAddress: true,
      },
    });

    if (!organization) {
      res.status(404).json({ message: 'Organization not found.' });
      return;
    }

    const state = resolvePlanState(organization as SubscriptionRow);

    // Consumption belongs next to the limit it counts against. Reporting it
    // anywhere else invites two screens quoting different plans, which is
    // exactly what happened while the settings page read `plan` off the row.
    const period = currentPeriod();
    const meter = await prisma.usageMeter.findUnique({
      where: { organizationId_period: { organizationId: user.organizationId, period } },
    });

    res.json({
      subscription: {
        ...state,
        startedAt: organization.planStartedAt,
        limits: PLAN_LIMITS[state.effectivePlan],
        usage: {
          period,
          eventsCreated: meter?.eventsCreated ?? 0,
          participantsJoined: meter?.participantsJoined ?? 0,
        },
      },
      billingDetails: {
        gstin: organization.gstin,
        stateCode: organization.stateCode,
        stateName: stateNameFor(organization.stateCode),
        billingCountry: organization.billingCountry,
        billingName: organization.billingName,
        billingAddress: organization.billingAddress,
        /// Checkout is refused while this is true.
        incomplete: missingTaxDetails(organization),
      },
    });
  } catch (error) {
    slog('error', 'billing.subscription_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Moves every workspace whose grace window has closed back to the free tier.
 *
 * Enforcement does not depend on this running — `resolvePlanState` already
 * treats a lapsed period as free at read time. This exists so the stored row
 * matches reality, so admin screens and exports are not quietly wrong.
 */
export const expireOverdueSubscriptions = async (): Promise<number> => {
  const candidates = await prisma.organization.findMany({
    where: {
      planStatus: { in: ['ACTIVE', 'GRACE'] },
      planExpiresAt: { not: null },
    },
    select: { id: true, plan: true, planStatus: true, planExpiresAt: true },
  });

  let lapsed = 0;

  for (const organization of candidates) {
    const state = resolvePlanState(organization as SubscriptionRow);

    if (state.lapsed) {
      await lapsePlan(organization.id);
      lapsed += 1;
      slog('info', 'billing.plan_lapsed', {
        organizationId: organization.id,
        was: organization.plan,
      });
      continue;
    }

    // Record the move into grace so the row is not still claiming ACTIVE.
    if (state.status !== organization.planStatus) {
      await prisma.organization.update({
        where: { id: organization.id },
        data: { planStatus: state.status },
      });
    }
  }

  return lapsed;
};
