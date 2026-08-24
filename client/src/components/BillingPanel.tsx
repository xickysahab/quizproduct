import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard, Receipt, AlertTriangle, Check, Loader2, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../services/api';
import { formatRupees, formatRupeesShort } from '../utils/money';
import { openRazorpayCheckout } from '../utils/razorpayCheckout';
import type { CheckoutSession } from '../utils/razorpayCheckout';

/**
 * Plan and billing.
 *
 * The order of the three blocks is deliberate: what you are on, who you are
 * for tax purposes, then what you could move to. Checkout is refused by the
 * server until the middle block is filled in — an Indian buyer with no place
 * of supply cannot be invoiced correctly — so putting the plan cards last
 * means the form is already on screen when that refusal arrives, rather than
 * the user being bounced somewhere else mid-purchase.
 */

type PlanId = 'FREE' | 'PRO' | 'ENTERPRISE';
type Status = 'NONE' | 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'MANUAL';

interface Subscription {
  effectivePlan: PlanId;
  billedPlan: PlanId;
  status: Status;
  expiresAt: string | null;
  accessEndsAt: string | null;
  daysRemaining: number | null;
  inGrace: boolean;
  lapsed: boolean;
  limits: { label: string; eventsPerMonth: number; participantsPerEvent: number; questionsPerEvent: number };
  usage: { period: string; eventsCreated: number; participantsJoined: number };
}

interface BillingDetails {
  gstin: string | null;
  stateCode: string | null;
  stateName: string | null;
  billingCountry: string;
  billingName: string | null;
  billingAddress: string | null;
  incomplete: boolean;
}

interface PlanCard {
  id: PlanId;
  label: string;
  blurb: string;
  pricePaise: number;
  priceWithGstPaise: number;
  eventsPerMonth: number;
  participantsPerEvent: number;
  questionsPerEvent: number;
  branding: boolean;
}

interface GstState {
  code: string;
  name: string;
}

const prettyDate = (value: string | null): string =>
  value ? format(new Date(value), 'd MMM yyyy') : '';

/** One line saying where this workspace stands, in the words a person would use. */
const statusLine = (subscription: Subscription): { tone: 'calm' | 'caution' | 'alert'; text: string } => {
  switch (subscription.status) {
    case 'ACTIVE':
      return {
        tone: 'calm',
        text: `Active until ${prettyDate(subscription.expiresAt)}${
          subscription.daysRemaining !== null ? ` · ${subscription.daysRemaining} days left` : ''
        }`,
      };
    case 'GRACE':
      return {
        tone: 'caution',
        text: `Payment overdue. Your ${subscription.billedPlan} features keep working until ${prettyDate(
          subscription.accessEndsAt
        )} — renew before then and nothing changes.`,
      };
    case 'EXPIRED':
      return {
        tone: 'alert',
        text: `Your ${subscription.billedPlan} plan ended on ${prettyDate(
          subscription.expiresAt
        )}. You are on the free tier's limits until you renew.`,
      };
    case 'MANUAL':
      return { tone: 'calm', text: 'Granted by your administrator. This plan does not expire.' };
    default:
      return { tone: 'calm', text: 'On the free plan. Upgrade whenever you need more room.' };
  }
};

const BillingPanel: React.FC = () => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [details, setDetails] = useState<BillingDetails | null>(null);
  const [plans, setPlans] = useState<PlanCard[]>([]);
  const [states, setStates] = useState<GstState[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDetails, setSavingDetails] = useState(false);
  const [buyingPlan, setBuyingPlan] = useState<PlanId | null>(null);

  // Form state, seeded from the server and edited locally.
  const [country, setCountry] = useState('IN');
  const [gstin, setGstin] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [billingName, setBillingName] = useState('');
  const [billingAddress, setBillingAddress] = useState('');

  const detailsRef = useRef<HTMLDivElement>(null);

  const applyDetails = (value: BillingDetails) => {
    setDetails(value);
    setCountry(value.billingCountry || 'IN');
    setGstin(value.gstin || '');
    setStateCode(value.stateCode || '');
    setBillingName(value.billingName || '');
    setBillingAddress(value.billingAddress || '');
  };

  const load = useCallback(async () => {
    try {
      const [sub, planList, stateList] = await Promise.all([
        api.get('/billing/subscription'),
        api.get('/billing/plans'),
        api.get('/billing/states'),
      ]);
      setSubscription(sub.data.subscription);
      applyDetails(sub.data.billingDetails);
      setPlans(planList.data.plans);
      setStates(stateList.data.states);
    } catch {
      toast.error('Could not load your billing details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A GSTIN carries its own state in its first two digits, and the server
  // treats it as authoritative. Mirror that here so the field cannot sit
  // showing a state the invoice will not use.
  const derivedState = gstin.trim().length >= 2 ? gstin.trim().slice(0, 2) : '';
  const effectiveState = derivedState || stateCode;
  const stateLockedByGstin = Boolean(derivedState && states.some((s) => s.code === derivedState));

  const saveDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingDetails(true);
    try {
      const res = await api.patch('/billing/tax-details', {
        billingCountry: country,
        gstin: country === 'IN' ? gstin.trim() : '',
        stateCode: country === 'IN' ? stateCode : '',
        billingName,
        billingAddress,
      });
      applyDetails({ ...res.data.organization, incomplete: res.data.incomplete });
      toast.success('Billing details saved.');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not save those billing details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const upgrade = async (plan: PlanId) => {
    setBuyingPlan(plan);
    try {
      const res = await api.post('/billing/checkout', { plan });
      const session = res.data as CheckoutSession;

      await openRazorpayCheckout(session, {
        onSuccess: async (paymentId) => {
          // The webhook may or may not have landed yet. Confirming from here
          // as well means the customer sees their plan change now instead of
          // watching a spinner until Razorpay gets round to calling us.
          try {
            await api.post('/billing/confirm', { paymentId });
            toast.success('Payment received — your plan is active.');
          } catch (error: any) {
            toast.error(
              error.response?.data?.message ||
                'Payment went through, but we could not confirm it here. It will update shortly.'
            );
          } finally {
            setBuyingPlan(null);
            void load();
          }
        },
        onDismiss: () => setBuyingPlan(null),
        onFailure: (message) => {
          toast.error(message);
          setBuyingPlan(null);
        },
      });
    } catch (error: any) {
      setBuyingPlan(null);

      if (error.response?.data?.code === 'BILLING_DETAILS_REQUIRED') {
        toast.error(error.response.data.message);
        detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      toast.error(error.response?.data?.message || 'Could not start checkout.');
    }
  };

  if (loading) {
    return (
      <div className="card p-6 flex items-center gap-3 text-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading billing…
      </div>
    );
  }

  if (!subscription || !details) return null;

  const status = statusLine(subscription);
  const toneClass =
    status.tone === 'alert'
      ? 'bg-wrong-wash text-wrong'
      : status.tone === 'caution'
        ? 'bg-caution-wash text-caution'
        : 'bg-accent-wash text-accent';

  return (
    <div className="space-y-6">
      {/* ---- Where this workspace stands ---------------------------------- */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-accent-wash flex items-center justify-center text-accent">
            <CreditCard className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-bold text-ink">Plan &amp; billing</h2>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
          <span className="text-2xl font-heading font-semibold text-ink">
            {subscription.limits.label}
          </span>
          {subscription.lapsed && (
            <span className="text-sm text-muted line-through">{subscription.billedPlan}</span>
          )}
        </div>

        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${toneClass}`}>
          {status.tone !== 'calm' && <AlertTriangle className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />}
          {status.text}
        </div>

        <dl className="grid grid-cols-3 gap-4 mt-5 text-sm">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wider text-faint mb-1">Sessions this month</dt>
            <dd className="font-medium text-ink tabular">
              {subscription.usage.eventsCreated}
              <span className="text-muted"> / {subscription.limits.eventsPerMonth}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wider text-faint mb-1">Participants / session</dt>
            <dd className="font-medium text-ink tabular">{subscription.limits.participantsPerEvent}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wider text-faint mb-1">Questions / session</dt>
            <dd className="font-medium text-ink tabular">{subscription.limits.questionsPerEvent}</dd>
          </div>
        </dl>
      </div>

      {/* ---- Who you are, for the invoice --------------------------------- */}
      <div className="card p-6" ref={detailsRef}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-accent-wash flex items-center justify-center text-accent">
            <Receipt className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-bold text-ink">Billing details</h2>
        </div>
        <p className="text-sm text-muted mb-5">
          These appear on your tax invoice. We need your state before we can charge you the right GST.
        </p>

        {details.incomplete && (
          <div className="rounded-xl bg-caution-wash text-caution px-4 py-3 text-sm font-medium mb-5">
            <AlertTriangle className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
            Add your state to enable checkout.
          </div>
        )}

        <form onSubmit={saveDetails} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
              Country
            </label>
            <select
              value={country === 'IN' ? 'IN' : 'OTHER'}
              onChange={(e) => setCountry(e.target.value === 'IN' ? 'IN' : 'US')}
              className="w-full px-4 py-3 rounded-xl border border-line bg-sunken text-ink text-sm outline-none"
            >
              <option value="IN">India</option>
              <option value="OTHER">Outside India</option>
            </select>
            {country !== 'IN' && (
              <p className="text-xs text-muted mt-1.5">
                Billed as an export of services — zero-rated, so no GST is charged.
              </p>
            )}
          </div>

          {country === 'IN' && (
            <>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                  GSTIN <span className="text-faint font-medium normal-case">(optional)</span>
                </label>
                <input
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  maxLength={15}
                  placeholder="27AAPFU0939F1ZV"
                  className="w-full px-4 py-3 rounded-xl border border-line bg-sunken text-ink text-sm font-mono outline-none"
                />
                <p className="text-xs text-muted mt-1.5">
                  Registered businesses can claim input credit against this.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                  State <span className="text-wrong font-medium normal-case">(required)</span>
                </label>
                <select
                  value={effectiveState}
                  disabled={stateLockedByGstin}
                  onChange={(e) => setStateCode(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-line bg-sunken text-ink text-sm outline-none disabled:opacity-60"
                >
                  <option value="">Select a state…</option>
                  {states.map((state) => (
                    <option key={state.code} value={state.code}>
                      {state.name}
                    </option>
                  ))}
                </select>
                {stateLockedByGstin && (
                  <p className="text-xs text-muted mt-1.5">
                    Taken from your GSTIN — the first two digits are the state it is registered in.
                  </p>
                )}
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
              Registered name
            </label>
            <input
              value={billingName}
              onChange={(e) => setBillingName(e.target.value)}
              maxLength={120}
              className="w-full px-4 py-3 rounded-xl border border-line bg-sunken text-ink text-sm outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
              Billing address
            </label>
            <textarea
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              maxLength={400}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-line bg-sunken text-ink text-sm outline-none resize-y"
            />
          </div>

          <button
            type="submit"
            disabled={savingDetails}
            className="btn-primary px-6 py-3 rounded-xl text-sm disabled:opacity-50"
          >
            {savingDetails ? 'Saving…' : 'Save billing details'}
          </button>
        </form>
      </div>

      {/* ---- What you could move to --------------------------------------- */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-ink mb-1">Plans</h2>
        <p className="text-sm text-muted mb-5">
          Priced per workspace, not per seat. Monthly, so you can stop whenever you like.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const isCurrent = plan.id === subscription.effectivePlan;
            const isPaid = plan.pricePaise > 0;

            return (
              <div
                key={plan.id}
                className={`rounded-2xl border p-5 flex flex-col ${
                  isCurrent ? 'border-accent bg-accent-wash' : 'border-line bg-surface'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-heading font-semibold text-ink">{plan.label}</h3>
                  {isCurrent && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-accent">
                      <Check className="w-3.5 h-3.5" />
                      Current
                    </span>
                  )}
                </div>

                <p className="text-2xl font-heading font-semibold text-ink tabular">
                  {isPaid ? formatRupeesShort(plan.pricePaise) : 'Free'}
                  {isPaid && <span className="text-sm font-sans font-medium text-muted"> /month</span>}
                </p>
                {isPaid && (
                  <p className="text-xs text-muted mb-3 tabular">
                    {formatRupees(plan.priceWithGstPaise)} incl. 18% GST
                  </p>
                )}

                <p className="text-sm text-muted mb-4 flex-1">{plan.blurb}</p>

                <ul className="text-xs text-muted space-y-1 mb-4">
                  <li className="tabular">{plan.eventsPerMonth} sessions / month</li>
                  <li className="tabular">{plan.participantsPerEvent} participants / session</li>
                  <li className="tabular">{plan.questionsPerEvent} questions / session</li>
                  {plan.branding && <li>Custom branding</li>}
                </ul>

                {isPaid && !isCurrent && (
                  <button
                    type="button"
                    onClick={() => void upgrade(plan.id)}
                    disabled={buyingPlan !== null}
                    className="btn-primary w-full px-4 py-2.5 rounded-xl text-sm disabled:opacity-50"
                  >
                    {buyingPlan === plan.id ? 'Opening checkout…' : `Get ${plan.label}`}
                  </button>
                )}

                {isPaid && isCurrent && subscription.status !== 'MANUAL' && (
                  <button
                    type="button"
                    onClick={() => void upgrade(plan.id)}
                    disabled={buyingPlan !== null}
                    className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold border border-accent-soft text-accent disabled:opacity-50"
                  >
                    {buyingPlan === plan.id ? 'Opening checkout…' : 'Renew for another month'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-faint mt-5 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          Payments are handled by Razorpay. We never see your card or UPI details.
        </p>
      </div>
    </div>
  );
};

export default BillingPanel;
