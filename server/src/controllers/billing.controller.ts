import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { env } from '../config/env';
import { seller, sellerIdentityComplete, isGstRegistered } from '../config/seller';
import { slog } from '../utils/slog';
import { PlanName, currentPeriod, offeredPlans, planByCode, limitsFor } from '../utils/plans';
import { createOrder, fetchOrder, fetchPayment, isRazorpayConfigured } from '../utils/razorpay';
import { nextPeriodEnd, resolvePlanState, SubscriptionRow } from '../utils/subscription';
import {
  computeGst,
  formatInvoiceNumber,
  financialYear,
  isValidGstin,
  isValidStateCode,
  GST_RATE,
  stateCodeFromGstin,
  stateNameFor,
  selectableStates,
  treatmentFor,
  documentTypeFor,
  placeOfSupplyRequired,
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

/** How this sale is taxed, given who is selling and who is buying. */
const treatmentOf = (profile: BillingProfile) =>
  treatmentFor({ sellerGstin: seller.gstin, buyerCountry: profile.billingCountry });

/**
 * Whether checkout should stop and ask for a place of supply.
 *
 * Only when it changes the tax. An unregistered supplier charges nothing
 * either way, so blocking a sale to collect a field that no calculation reads
 * would be friction for its own sake.
 */
const missingTaxDetails = (profile: BillingProfile): boolean =>
  placeOfSupplyRequired(treatmentOf(profile)) &&
  profile.billingCountry === 'IN' &&
  !profile.stateCode;

/** The states a buyer may pick, for the billing form. */
export const listStates = async (_req: Request, res: Response): Promise<void> => {
  res.json({ states: selectableStates() });
};

export const listPlans = async (_req: Request, res: Response): Promise<void> => {
  // The public price has to match what checkout will actually ask for. An
  // unregistered supplier charges no GST, so quoting a tax-inclusive figure
  // here would advertise a price nobody is ever charged.
  const registered = isGstRegistered();
  const treatment = registered ? 'GST' : 'UNREGISTERED';

  const catalogue = await offeredPlans();

  res.json({
    currency: 'INR',
    gstRatePercent: registered ? Math.round(GST_RATE * 100) : 0,
    gstApplies: registered,
    sac: SAC_CODE,
    plans: catalogue.map((plan) => {
      return {
        id: plan.code,
        label: plan.label,
        blurb: plan.blurb,
        pricePaise: plan.pricePaise,
        // Shown alongside so nobody is surprised at checkout. Computed against
        // the seller's own state, which is the intra-state case — the total is
        // the same 18% either way, only the split differs.
        priceWithGstPaise: computeGst(
          plan.pricePaise,
          seller.stateCode,
          undefined,
          treatment
        ).totalPaise,
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

    const planName = (req.body?.plan as PlanName) || '';
    const requested = await planByCode(planName);

    // Anything currently offered and priced can be bought. Hardcoding the two
    // paid codes here would have made a new tier unbuyable until someone
    // remembered to edit this line.
    if (!requested || !requested.isActive || requested.pricePaise <= 0) {
      res.status(400).json({ message: 'Choose a plan that is currently on sale.' });
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

    const plan = requested;
    const treatment = treatmentOf(organization);
    const tax = computeGst(
      plan.pricePaise,
      placeOfSupply(organization),
      undefined,
      treatment
    );

    const order = await createOrder(tax.totalPaise, `qp_${Date.now()}`, {
      organizationId: user.organizationId,
      plan: planName,
      // The price as it stood at this moment. Now that a SuperAdmin can edit
      // pricing, the catalogue may say something different by the time the
      // webhook lands — and the invoice has to state what was actually
      // charged, not what the plan costs today.
      pricePaise: String(plan.pricePaise),
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
      /// So the sheet can say what the buyer is actually paying and why.
      taxTreatment: treatment,
      documentType: documentTypeFor(treatment),
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

/**
 * The price this payment was actually made against.
 *
 * Written into the order's notes at checkout. Orders created before that was
 * done have no such note, so those fall back to the catalogue — the best
 * available answer for a payment taken while pricing was still a constant in
 * the source, and by definition unchanged since.
 */
const pricedAt = async (
  notes: Record<string, string> | undefined,
  planCode: string
): Promise<number> => {
  const noted = Number(notes?.pricePaise);
  if (Number.isFinite(noted) && noted > 0) return Math.round(noted);

  const plan = await planByCode(planCode);
  return plan?.pricePaise ?? 0;
};

/**
 * Writes the invoice for a completed payment.
 *
 * `pricePaise` is the amount the plan cost **when the order was created**, not
 * what it costs now. Prices are editable, so re-reading the catalogue here
 * would let an edit between checkout and confirmation produce an invoice for a
 * figure the customer was never charged — a document that disagrees with the
 * bank statement it is filed against.
 */
const issueInvoice = async (
  organizationId: string,
  plan: PlanName,
  provider: string,
  providerRef: string,
  pricePaise: number,
  period?: { start: Date; end: Date }
) => {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { gstin: true, stateCode: true, billingCountry: true },
  });

  const treatment = organization
    ? treatmentOf(organization)
    : treatmentFor({ sellerGstin: seller.gstin, buyerCountry: 'IN' });

  const tax = computeGst(
    pricePaise,
    organization ? placeOfSupply(organization) : null,
    undefined,
    treatment
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
      documentType: documentTypeFor(treatment),
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
 * One invoice, as a document rather than a row.
 *
 * Assembles both parties, because a tax invoice is a statement about a
 * transaction between two identified businesses and half of it — the supplier
 * — lives in configuration rather than in the row. The buyer's details are
 * read from the invoice, not from the organisation as it stands today: a
 * customer who moves office or registers for GST later must not silently
 * rewrite an invoice that was already filed.
 */
export const getInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { organizationId: true },
    });

    if (!user?.organizationId) {
      res.status(404).json({ message: 'No organization is attached to this account.' });
      return;
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id as string },
      include: { organization: { select: { id: true, name: true, billingName: true, billingAddress: true } } },
    });

    // Scoped to the caller's workspace, and a 404 rather than a 403 so the
    // response does not confirm that someone else's invoice id exists.
    if (!invoice || invoice.organizationId !== user.organizationId) {
      res.status(404).json({ message: 'Invoice not found.' });
      return;
    }

    const taxTotal = invoice.cgstPaise + invoice.sgstPaise + invoice.igstPaise;

    res.json({
      invoice: {
        id: invoice.id,
        number: invoice.invoiceNumber,
        issuedAt: invoice.issuedAt,
        status: invoice.status,
        plan: invoice.plan,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        provider: invoice.provider,
        providerRef: invoice.providerRef,
        hsnSac: invoice.hsnSac,
        documentType: invoice.documentType,
        placeOfSupply: invoice.placeOfSupply,
        placeOfSupplyName: stateNameFor(invoice.placeOfSupply),
        currency: invoice.currency,
        subtotalPaise: invoice.subtotalPaise,
        cgstPaise: invoice.cgstPaise,
        sgstPaise: invoice.sgstPaise,
        igstPaise: invoice.igstPaise,
        taxTotalPaise: taxTotal,
        totalPaise: invoice.totalPaise,
        /// Zero tax on a tax invoice with no place of supply is an export.
        /// Zero tax on a bill of supply is simply an unregistered supplier —
        /// a different thing, and the document has to say which.
        isExport:
          invoice.documentType === 'TAX_INVOICE' && taxTotal === 0 && !invoice.placeOfSupply,
        gstRatePercent: Math.round(GST_RATE * 100),
      },
      supplier: {
        legalName: seller.legalName,
        gstin: seller.gstin ?? null,
        address: seller.address ?? null,
        email: seller.email ?? null,
        stateCode: seller.stateCode,
        stateName: seller.stateName,
        /// The UI says so plainly rather than printing a document that looks
        /// official and is not.
        complete: sellerIdentityComplete(),
      },
      buyer: {
        name: invoice.organization.billingName || invoice.organization.name,
        address: invoice.organization.billingAddress,
        gstin: invoice.gstin,
      },
    });
  } catch (error) {
    slog('error', 'billing.invoice_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Starts or extends a paid period.
 *
 * Returns the period *this payment bought*, which is not the workspace's new
 * expiry. A customer who renews a week early has access extended from the
 * existing expiry rather than from today, so the resulting expiry can be five
 * weeks out — but the invoice must still cover one month, because one month is
 * what was sold and what the 18% was charged on. Billing a month and
 * documenting five weeks is how a GST return stops reconciling.
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

  const currentExpiry = organization?.planExpiresAt ?? null;
  const end = nextPeriodEnd(currentExpiry, now, months);
  // Where the bought month actually begins: when the old one runs out if it
  // has not yet, otherwise today.
  const start =
    currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;

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

  return { start, end };
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
      const price = await pricedAt(entity?.notes, plan);
      await issueInvoice(organizationId, plan, 'razorpay', externalId, price, period);
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
      await issueInvoice(
        organizationId,
        'PRO',
        'stripe',
        event.id || 'unknown',
        await pricedAt(undefined, 'PRO'),
        period
      );
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

    const boughtPlan = await planByCode(paidPlan);

    // Deliberately does not require the plan to still be on sale. Somebody who
    // paid while a tier was offered must get what they paid for, even if it was
    // withdrawn between checkout and confirmation.
    if (!paidPlan || !boughtPlan || boughtPlan.pricePaise <= 0) {
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
      await pricedAt(order.notes, paidPlan),
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
        limits: await limitsFor(state.effectivePlan),
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
