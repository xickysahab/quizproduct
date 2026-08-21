import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { env } from '../config/env';
import { slog } from '../utils/slog';
import { PlanName } from '../utils/plans';

const stripeHeaders = () => ({
  Authorization: `Bearer ${env.stripeSecretKey}`,
  'Content-Type': 'application/x-www-form-urlencoded',
});

export const createCheckoutSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!env.stripeSecretKey || !env.stripePricePro) {
      res.status(501).json({
        message: 'Billing is not configured on this server. Ask a SuperAdmin to assign a plan, or set STRIPE_SECRET_KEY and STRIPE_PRICE_PRO.',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { organizationId: true, email: true, role: true },
    });

    if (!user?.organizationId || user.role === 'STAFF') {
      res.status(403).json({ message: 'Only a tenant admin can start a subscription.' });
      return;
    }

    const params = new URLSearchParams({
      mode: 'subscription',
      success_url: `${env.frontendOrigin}/tenant/settings?billing=success`,
      cancel_url: `${env.frontendOrigin}/tenant/settings?billing=cancel`,
      client_reference_id: user.organizationId,
      'line_items[0][price]': env.stripePricePro,
      'line_items[0][quantity]': '1',
      'metadata[organizationId]': user.organizationId,
      customer_email: user.email,
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: stripeHeaders(),
      body: params,
    });
    const body = (await response.json()) as { id?: string; url?: string; error?: { message: string } };

    if (!response.ok || !body.url) {
      slog('error', 'stripe.checkout_failed', { error: body.error?.message });
      res.status(502).json({ message: body.error?.message || 'Could not start checkout.' });
      return;
    }

    res.json({ url: body.url, id: body.id });
  } catch (error) {
    slog('error', 'billing.checkout_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const stripeWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!env.stripeWebhookSecret) {
      res.status(501).json({ message: 'Stripe webhooks are not configured.' });
      return;
    }

    const signature = req.header('stripe-signature');
    if (!signature || !Buffer.isBuffer(req.body)) {
      res.status(400).json({ message: 'Invalid webhook payload.' });
      return;
    }

    // Stripe-Signature: t=timestamp,v1=hmac
    const parts = Object.fromEntries(
      signature.split(',').map((piece) => {
        const [k, ...rest] = piece.split('=');
        return [k, rest.join('=')];
      })
    );
    const signed = `${parts.t}.${req.body.toString('utf8')}`;
    const expected = crypto.createHmac('sha256', env.stripeWebhookSecret).update(signed).digest('hex');
    if (expected !== parts.v1) {
      res.status(400).json({ message: 'Invalid Stripe signature.' });
      return;
    }

    const event = JSON.parse(req.body.toString('utf8')) as {
      type: string;
      data: { object: { client_reference_id?: string; metadata?: { organizationId?: string }; status?: string } };
    };

    const organizationId =
      event.data.object.metadata?.organizationId || event.data.object.client_reference_id;

    if (organizationId && (event.type === 'checkout.session.completed' || event.type === 'invoice.paid')) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: { plan: 'PRO' as PlanName },
      });
    }

    if (organizationId && (event.type === 'customer.subscription.deleted' || event.type === 'invoice.payment_failed')) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: { plan: 'FREE' },
      });
    }

    res.json({ received: true });
  } catch (error) {
    slog('error', 'billing.webhook_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};
