import React from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { CheckCircle2, Clock, XCircle, MinusCircle } from 'lucide-react';
import { Rise } from 'cube-motion/react';
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

  const press = 'transition-transform duration-100 ease-out active:scale-[0.97]';

  return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6 font-sans">
        {/* The card's rows rise in order: logo, verdict, details, actions. */}
        <Rise
          targets="children"
          className="max-w-md w-full bg-white rounded-3xl p-8 sm:p-10 text-center shadow-sm border border-gray-200 space-y-6"
        >
          <Logo size={40} className="mx-auto" />

          <div>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${view.tone}`}>
              <Icon className="w-8 h-8" />
            </div>
            <h1 className="mt-5 text-[1.625rem] leading-tight tracking-[-0.02em] font-bold text-gray-900">{view.title}</h1>
            <p role={status === 'failed' ? 'alert' : undefined} className="mt-2 text-[15px] leading-relaxed text-gray-500">
              {state.message || view.body}
            </p>
          </div>

          {(state.plan || state.paymentId || state.invoice?.totalPaise != null) && (
            <dl className="text-left text-sm rounded-2xl bg-gray-50 divide-y divide-gray-200/70">
              {state.plan && (
                <div className="flex justify-between gap-4 px-4 py-3">
                  <dt className="text-gray-500">Plan</dt>
                  <dd className="font-medium text-gray-900 capitalize">{state.plan.toLowerCase()}</dd>
                </div>
              )}
              {state.invoice?.totalPaise != null && (
                <div className="flex justify-between gap-4 px-4 py-3">
                  <dt className="text-gray-500">Amount paid</dt>
                  <dd className="font-semibold text-gray-900 tabular-nums">{formatRupees(state.invoice.totalPaise)}</dd>
                </div>
              )}
              {state.paymentId && (
                <div className="flex justify-between gap-4 px-4 py-3">
                  <dt className="text-gray-500">Payment ID</dt>
                  <dd className="font-mono text-xs text-gray-900 break-all select-all">{state.paymentId}</dd>
                </div>
              )}
            </dl>
          )}

          <div className="space-y-3">
            <Link
              to="/tenant/settings"
              className={`${press} block w-full py-3.5 rounded-2xl gradient-btn text-white font-semibold text-[15px]`}
            >
              {view.cta}
            </Link>

            {state.invoice?.id && (
              <Link
                to={`/invoice/${state.invoice.id}`}
                className={`${press} block w-full py-3.5 rounded-2xl text-[15px] font-semibold text-accent bg-accent-wash`}
              >
                View invoice{state.invoice.invoiceNumber ? ` ${state.invoice.invoiceNumber}` : ''}
              </Link>
            )}
          </div>

          {(status === 'failed' || status === 'pending') && (
            <p className="text-xs text-gray-400">
              Still stuck? <Link to="/legal/contact" className="underline">Contact us</Link>
              {state.paymentId ? ' and quote the payment ID above.' : '.'}
            </p>
          )}
        </Rise>
      </div>
  );
};

export default PaymentResult;
