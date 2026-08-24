import { env } from '../config/env';
import { slog } from './slog';

/**
 * Razorpay, the payment rail this product actually needs.
 *
 * Stripe cannot take recurring payments from most Indian customers. Indian
 * subscriptions run on UPI AutoPay and card/e-mandate rails through a domestic
 * gateway, and a customer who cannot pay by UPI mostly will not pay at all.
 *
 * Kept as plain fetch calls against the documented REST API, matching how the
 * existing Stripe code was written, rather than adding another dependency.
 */

const BASE = 'https://api.razorpay.com/v1';

export const isRazorpayConfigured = (): boolean =>
  Boolean(env.razorpayKeyId && env.razorpayKeySecret);

const authHeader = (): string =>
  `Basic ${Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString('base64')}`;

const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      (body as { error?: { description?: string } })?.error?.description || `Razorpay ${response.status}`;
    slog('error', 'razorpay.call_failed', { path, status: response.status, message });
    throw new Error(message);
  }

  return body as T;
};

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

/**
 * A one-off order — the simplest thing that works, and the right default for a
 * monthly workspace plan bought by an Indian buyer who wants to pay by UPI.
 *
 * `amountPaise` must be GST-inclusive: Razorpay charges what it is given.
 */
export const createOrder = async (
  amountPaise: number,
  receipt: string,
  notes: Record<string, string>
): Promise<RazorpayOrder> =>
  call<RazorpayOrder>('/orders', {
    method: 'POST',
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt: receipt.slice(0, 40),
      notes,
    }),
  });

export interface RazorpayPayment {
  id: string;
  order_id: string;
  status: string;
  amount: number;
  method?: string;
}

export const fetchPayment = async (paymentId: string): Promise<RazorpayPayment> =>
  call<RazorpayPayment>(`/payments/${paymentId}`);
