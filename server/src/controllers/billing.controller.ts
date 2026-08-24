import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { env } from '../config/env';
import { slog } from '../utils/slog';
import { PlanName, PLAN_LIMITS } from '../utils/plans';
import { createOrder, fetchPayment, isRazorpayConfigured } from '../utils/razorpay';
import {
  computeGst,
  formatInvoiceNumber,
  financialYear,
  isValidGstin,
  stateCodeFromGstin,
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
      select: { id: true, name: true, gstin: true, stateCode: true },
    });

    const plan = PLAN_LIMITS[planName];
    // The buyer's state decides CGST+SGST versus IGST; no state means an
    // export of services, which is zero-rated.
    const tax = computeGst(plan.pricePaise, organization?.stateCode ?? null);

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
      organizationName: organization?.name,
      prefill: { email: user.email, name: user.name },
    });
  } catch (error) {
    slog('error', 'billing.checkout_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Could not start checkout. Please try again.' });
  }
};

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

    const { gstin, billingName, billingAddress, stateCode } = req.body || {};
    const data: Record<string, string | null> = {};

    if (gstin !== undefined) {
      const value = typeof gstin === 'string' ? gstin.trim().toUpperCase() : '';
      if (value && !isValidGstin(value)) {
        res.status(400).json({ message: 'That does not look like a valid 15-character GSTIN.' });
        return;
      }
      data.gstin = value || null;
      // The state code lives inside the GSTIN, so derive it rather than asking
      // twice and risking the two disagreeing on the invoice.
      if (value) data.stateCode = stateCodeFromGstin(value);
    }

    if (typeof stateCode === 'string' && /^[0-3][0-9]$/.test(stateCode.trim())) {
      data.stateCode = stateCode.trim();
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
      select: { gstin: true, stateCode: true, billingName: true, billingAddress: true },
    });

    res.json({ message: 'Billing details updated.', organization });
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
  providerRef: string
) => {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { gstin: true, stateCode: true },
  });

  const tax = computeGst(PLAN_LIMITS[plan].pricePaise, organization?.stateCode ?? null);

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

const setPlan = async (organizationId: string, plan: PlanName) => {
  await prisma.organization.update({ where: { id: organizationId }, data: { plan } });
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
      await setPlan(organizationId, plan);
      await issueInvoice(organizationId, plan, 'razorpay', externalId);
      slog('info', 'billing.plan_activated', { organizationId, plan, provider: 'razorpay' });
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
      await setPlan(organizationId, 'PRO');
      await issueInvoice(organizationId, 'PRO', 'stripe', event.id || 'unknown');
    }

    // A failed invoice no longer downgrades immediately. Stripe retries for
    // days, so cutting a paying customer off mid-event on the first failure is
    // the wrong response — only an actually cancelled subscription downgrades.
    if (organizationId && event.type === 'customer.subscription.deleted') {
      await setPlan(organizationId, 'FREE');
    }

    res.json({ received: true });
  } catch (error) {
    slog('error', 'billing.webhook_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/** Confirms a payment straight from the client, as a fallback if the webhook is slow. */
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

    if (!(await consumeWebhookEvent('razorpay', payment.id, 'client.confirm'))) {
      res.json({ message: 'Already applied.', duplicate: true });
      return;
    }

    await setPlan(user.organizationId, 'PRO');
    const invoice = await issueInvoice(user.organizationId, 'PRO', 'razorpay', payment.id);

    res.json({ message: 'Payment confirmed.', invoice });
  } catch (error) {
    slog('error', 'billing.confirm_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Could not confirm that payment.' });
  }
};
