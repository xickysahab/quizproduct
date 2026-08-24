/**
 * Razorpay Checkout, loaded on demand.
 *
 * The script is ~90KB and only matters to the handful of people who ever open
 * the billing page, so it is not in index.html. It is also loaded exactly once
 * per session: a second <script> tag for the same source does not just waste a
 * request, it re-registers the global and orphans any handler already bound.
 *
 * Nothing here decides what is charged. The server builds the order — amount,
 * tax, plan — and this only opens the sheet against the order id it returns.
 * A price computed on the client is a price the client can edit.
 */

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let pending: Promise<void> | null = null;

export const loadRazorpay = (): Promise<void> => {
  if (window.Razorpay) return Promise.resolve();
  if (pending) return pending;

  pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever —
      // this fails on a flaky connection as often as on a blocked script.
      pending = null;
      reject(new Error('Could not reach Razorpay. Check your connection and try again.'));
    };
    document.body.appendChild(script);
  });

  return pending;
};

/** Exactly what POST /billing/checkout returns. */
export interface CheckoutSession {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  plan: string;
  organizationName?: string;
  prefill?: { email?: string; name?: string };
}

interface CheckoutHandlers {
  onSuccess: (paymentId: string) => void;
  /** Fired when the sheet is closed without paying, and on a declined payment. */
  onDismiss?: () => void;
  onFailure?: (message: string) => void;
}

export const openRazorpayCheckout = async (
  session: CheckoutSession,
  { onSuccess, onDismiss, onFailure }: CheckoutHandlers
): Promise<void> => {
  await loadRazorpay();

  if (!window.Razorpay) {
    throw new Error('Razorpay Checkout did not load.');
  }

  const checkout = new window.Razorpay({
    key: session.keyId,
    order_id: session.orderId,
    amount: session.amountPaise,
    currency: session.currency,
    name: 'QuizPulse',
    description: `${session.plan} plan${session.organizationName ? ` — ${session.organizationName}` : ''}`,
    prefill: session.prefill || {},
    notes: { plan: session.plan },
    theme: { color: '#0E8A7D' },
    handler: (response: RazorpaySuccess) => onSuccess(response.razorpay_payment_id),
    modal: { ondismiss: () => onDismiss?.() },
  });

  checkout.on('payment.failed', (response) => {
    onFailure?.(response.error?.description || 'That payment did not go through.');
  });

  checkout.open();
};
