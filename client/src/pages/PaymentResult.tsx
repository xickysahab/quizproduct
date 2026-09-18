import React from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { CheckCircle2, Clock, XCircle, MinusCircle } from 'lucide-react';
import Logo from '../components/Logo';
import { formatRupees } from '../utils/money';

/**
 * Where BillingPanel sends the customer once Razorpay is done with them.
 *
 * Details travel in router state, not the query string: payment ids and
 * failure reasons have no business in server logs or a shared URL. State
 * survives a refresh (it lives in history), and a page opened cold still
 * renders the right headline, just without the extras.
 */

export type PaymentStatus = 'success' | 'pending' | 'failed' | 'cancelled';

export interface PaymentResultState {
  plan?: string;
  paymentId?: string;
  message?: string;
  invoice?: { id: string; invoiceNumber?: string; totalPaise?: number };
}

const VIEWS: Record<PaymentStatus, {
  icon: typeof CheckCircle2;
  tone: string;
  title: string;
  body: string;
  cta: string;
}> = {
  success: {
    icon: CheckCircle2,
    tone: 'bg-emerald-50 text-emerald-600',
    title: 'Payment successful',
    body: 'Your plan is active. A tax invoice has been issued to your workspace.',
    cta: 'Back to billing',
  },
  pending: {
    icon: Clock,
    tone: 'bg-amber-50 text-amber-600',
    title: 'Payment received, activation pending',
    body: 'Razorpay took the payment but we could not confirm it just now. Your plan will switch over within a few minutes — you will not be charged again.',
    cta: 'Back to billing',
  },
  failed: {
    icon: XCircle,
    tone: 'bg-rose-50 text-rose-600',
    title: 'Payment failed',
    body: 'Nothing was charged. If money left your account, your bank will reverse it within 5–7 working days.',
    cta: 'Try again',
  },
  cancelled: {
    icon: MinusCircle,
    tone: 'bg-gray-100 text-gray-500',
    title: 'Payment cancelled',
    body: 'You closed the checkout before paying. Nothing was charged.',
    cta: 'Back to plans',
  },
};

const PaymentResult: React.FC = () => {
  const { status } = useParams();
  const state = (useLocation().state || {}) as PaymentResultState;

  if (!status || !(status in VIEWS)) return <Navigate to="/tenant/settings" replace />;

  const view = VIEWS[status as PaymentStatus];
  const Icon = view.icon;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl p-10 text-center shadow-sm border border-gray-200 space-y-5">
        <Logo size={44} className="mx-auto" />

        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${view.tone}`}>
          <Icon className="w-7 h-7" />
        </div>
        <h1 className="font-heading text-2xl font-bold text-gray-900">{view.title}</h1>
        <p className="text-sm text-gray-500">{state.message || view.body}</p>

        {(state.plan || state.paymentId || state.invoice?.totalPaise != null) && (
          <dl className="text-left text-sm bg-gray-50 rounded-2xl p-4 space-y-2">
            {state.plan && (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Plan</dt>
                <dd className="font-medium text-gray-900 capitalize">{state.plan.toLowerCase()}</dd>
              </div>
            )}
            {state.invoice?.totalPaise != null && (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Amount paid</dt>
                <dd className="font-medium text-gray-900">{formatRupees(state.invoice.totalPaise)}</dd>
              </div>
            )}
            {state.paymentId && (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Payment ID</dt>
                <dd className="font-mono text-xs text-gray-900 break-all">{state.paymentId}</dd>
              </div>
            )}
          </dl>
        )}

        <Link
          to="/tenant/settings"
          className="inline-block w-full py-3.5 rounded-2xl gradient-btn text-white font-medium text-sm"
        >
          {view.cta}
        </Link>

        {state.invoice?.id && (
          <Link to={`/invoice/${state.invoice.id}`} className="inline-block text-sm font-semibold text-accent">
            View invoice{state.invoice.invoiceNumber ? ` ${state.invoice.invoiceNumber}` : ''}
          </Link>
        )}

        {(status === 'failed' || status === 'pending') && (
          <p className="text-xs text-gray-400">
            Still stuck? <Link to="/legal/contact" className="underline">Contact us</Link>
            {state.paymentId ? ' and quote the payment ID above.' : '.'}
          </p>
        )}
      </div>
    </div>
  );
};

export default PaymentResult;
