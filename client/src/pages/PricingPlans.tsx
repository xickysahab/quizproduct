import React, { useCallback, useEffect, useState } from 'react';
import { Tag, Plus, Check, EyeOff, Eye, Loader2, AlertTriangle, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { sidebarForRole, dashboardTitleForRole } from '../config/sidebar';
import { formatRupees } from '../utils/money';

/**
 * Pricing, as the platform owner sets it.
 *
 * Prices were a constant in the server's source, so changing one meant a
 * deploy. They are rows now, and this is where they are edited.
 *
 * Two things this screen is careful about. It always shows how many workspaces
 * are on a plan, because withdrawing one nobody uses is housekeeping and
 * withdrawing one forty customers are on is a decision — and the number is the
 * only thing that distinguishes them. And it works in rupees while the API
 * works in paise: money is stored as integers so it cannot drift, and the
 * conversion happens here, at the edge, once.
 */

interface Plan {
  id: string;
  code: string;
  label: string;
  blurb: string;
  pricePaise: number;
  priceWithTaxPaise: number;
  taxApplies: boolean;
  eventsPerMonth: number;
  participantsPerEvent: number;
  questionsPerEvent: number;
  branding: boolean;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  organizationCount: number;
}

/** Rupees in the input, paise on the wire. */
const toPaise = (rupees: string): number => Math.round(Number(rupees) * 100);
const toRupees = (paise: number): string => String(paise / 100);

interface DraftFields {
  code: string;
  label: string;
  blurb: string;
  priceRupees: string;
  eventsPerMonth: string;
  participantsPerEvent: string;
  questionsPerEvent: string;
  branding: boolean;
  sortOrder: string;
}

const blankDraft = (): DraftFields => ({
  code: '',
  label: '',
  blurb: '',
  priceRupees: '',
  eventsPerMonth: '',
  participantsPerEvent: '',
  questionsPerEvent: '',
  branding: true,
  sortOrder: '10',
});

const draftFrom = (plan: Plan): DraftFields => ({
  code: plan.code,
  label: plan.label,
  blurb: plan.blurb,
  priceRupees: toRupees(plan.pricePaise),
  eventsPerMonth: String(plan.eventsPerMonth),
  participantsPerEvent: String(plan.participantsPerEvent),
  questionsPerEvent: String(plan.questionsPerEvent),
  branding: plan.branding,
  sortOrder: String(plan.sortOrder),
});

const Field: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div>
    <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
      {label}
    </label>
    {children}
    {hint && <p className="text-xs text-faint mt-1">{hint}</p>}
  </div>
);

const inputClass =
  'w-full px-4 py-2.5 rounded-xl border border-line bg-sunken text-ink text-sm outline-none disabled:opacity-60';

const PlanForm: React.FC<{
  draft: DraftFields;
  setDraft: (next: DraftFields) => void;
  isNew: boolean;
  saving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}> = ({ draft, setDraft, isNew, saving, onSubmit, onCancel }) => {
  const set = <K extends keyof DraftFields>(key: K, value: DraftFields[K]) =>
    setDraft({ ...draft, [key]: value });

  return (
    <form
      className="space-y-4 border-t border-line pt-5 mt-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Code"
          hint={
            isNew
              ? 'Permanent. Written onto workspaces and invoices.'
              : 'Cannot be changed once a plan exists.'
          }
        >
          <input
            value={draft.code}
            disabled={!isNew}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
            placeholder="CAMPUS"
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field label="Name">
          <input
            value={draft.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="Campus"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Description" hint="One line, shown on the pricing page.">
        <input
          value={draft.blurb}
          onChange={(e) => set('blurb', e.target.value)}
          placeholder="For a whole college, one fest at a time."
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Price per month (₹)" hint="Before tax. Zero makes it a free tier.">
          <input
            type="number"
            min={0}
            step="1"
            value={draft.priceRupees}
            onChange={(e) => set('priceRupees', e.target.value)}
            placeholder="3999"
            className={`${inputClass} tabular`}
          />
        </Field>

        <Field label="Display order" hint="Lower numbers appear first.">
          <input
            type="number"
            min={0}
            value={draft.sortOrder}
            onChange={(e) => set('sortOrder', e.target.value)}
            className={`${inputClass} tabular`}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Sessions / month">
          <input
            type="number"
            min={1}
            value={draft.eventsPerMonth}
            onChange={(e) => set('eventsPerMonth', e.target.value)}
            className={`${inputClass} tabular`}
          />
        </Field>
        <Field label="Participants / session">
          <input
            type="number"
            min={1}
            value={draft.participantsPerEvent}
            onChange={(e) => set('participantsPerEvent', e.target.value)}
            className={`${inputClass} tabular`}
          />
        </Field>
        <Field label="Questions / session">
          <input
            type="number"
            min={1}
            value={draft.questionsPerEvent}
            onChange={(e) => set('questionsPerEvent', e.target.value)}
            className={`${inputClass} tabular`}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={draft.branding}
          onChange={(e) => set('branding', e.target.checked)}
        />
        Custom branding on the join screen
      </label>

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="btn-primary px-5 py-2.5 rounded-xl text-sm disabled:opacity-50">
          {saving ? 'Saving…' : isNew ? 'Create plan' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-line text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

const PricingPlans: React.FC = () => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<DraftFields>(blankDraft());

  const load = useCallback(async () => {
    try {
      const response = await api.get('/superadmin/plans');
      setPlans(response.data.plans);
    } catch {
      toast.error('Could not load the plan catalogue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const payloadFrom = (fields: DraftFields) => ({
    label: fields.label,
    blurb: fields.blurb,
    pricePaise: toPaise(fields.priceRupees || '0'),
    eventsPerMonth: Number(fields.eventsPerMonth),
    participantsPerEvent: Number(fields.participantsPerEvent),
    questionsPerEvent: Number(fields.questionsPerEvent),
    branding: fields.branding,
    sortOrder: Number(fields.sortOrder || '0'),
  });

  const save = async () => {
    setSaving(true);
    try {
      if (creating) {
        await api.post('/superadmin/plans', { code: draft.code, ...payloadFrom(draft) });
        toast.success(`${draft.label} created.`);
      } else if (editingId) {
        await api.patch(`/superadmin/plans/${editingId}`, payloadFrom(draft));
        toast.success('Plan updated.');
      }
      setCreating(false);
      setEditingId(null);
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not save that plan.');
    } finally {
      setSaving(false);
    }
  };

  const setAvailability = async (plan: Plan, isActive: boolean) => {
    try {
      const response = await api.patch(`/superadmin/plans/${plan.id}/availability`, { isActive });
      toast.success(response.data.message);
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not change that.');
    }
  };

  const makeDefault = async (plan: Plan) => {
    try {
      const response = await api.patch(`/superadmin/plans/${plan.id}/default`, {});
      toast.success(response.data.message);
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not change the default.');
    }
  };

  const startCreate = () => {
    setDraft(blankDraft());
    setCreating(true);
    setEditingId(null);
  };

  const startEdit = (plan: Plan) => {
    setDraft(draftFrom(plan));
    setEditingId(plan.id);
    setCreating(false);
  };

  return (
    <DashboardLayout title={dashboardTitleForRole(user?.role)} sidebarItems={sidebarForRole(user?.role)}>
      <div className="space-y-6 max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-ink">Pricing</h1>
            <p className="text-sm text-muted mt-1">
              What the product costs. Changes take effect for new purchases; nothing already
              invoiced is touched.
            </p>
          </div>
          <button
            type="button"
            onClick={startCreate}
            className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm"
          >
            <Plus className="w-4 h-4" />
            New plan
          </button>
        </div>

        {creating && (
          <div className="card p-6">
            <h2 className="text-lg font-bold text-ink">New plan</h2>
            <PlanForm
              draft={draft}
              setDraft={setDraft}
              isNew
              saving={saving}
              onSubmit={save}
              onCancel={() => setCreating(false)}
            />
          </div>
        )}

        {loading ? (
          <div className="card p-6 flex items-center gap-3 text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading plans…
          </div>
        ) : (
          plans.map((plan) => (
            <div key={plan.id} className={`card p-6 ${plan.isActive ? '' : 'opacity-70'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-wash flex items-center justify-center text-accent shrink-0">
                    <Tag className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-ink">{plan.label}</h2>
                      <span className="font-mono text-xs text-faint">{plan.code}</span>
                      {plan.isDefault && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-accent">
                          <Star className="w-3.5 h-3.5" />
                          Default
                        </span>
                      )}
                      {!plan.isActive && (
                        <span className="text-xs font-bold uppercase tracking-wider text-caution">
                          Withdrawn
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted mt-0.5">{plan.blurb}</p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xl font-heading font-semibold text-ink tabular">
                    {plan.pricePaise === 0 ? 'Free' : `${formatRupees(plan.pricePaise)}`}
                    {plan.pricePaise > 0 && (
                      <span className="text-sm font-sans font-medium text-muted"> /mo</span>
                    )}
                  </p>
                  {plan.pricePaise > 0 && plan.taxApplies && (
                    <p className="text-xs text-muted tabular">
                      {formatRupees(plan.priceWithTaxPaise)} incl. GST
                    </p>
                  )}
                </div>
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 text-sm">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-faint mb-1">
                    Sessions / mo
                  </dt>
                  <dd className="font-medium text-ink tabular">{plan.eventsPerMonth.toLocaleString('en-IN')}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-faint mb-1">
                    Participants
                  </dt>
                  <dd className="font-medium text-ink tabular">
                    {plan.participantsPerEvent.toLocaleString('en-IN')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-faint mb-1">
                    Questions
                  </dt>
                  <dd className="font-medium text-ink tabular">{plan.questionsPerEvent}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-faint mb-1">
                    Workspaces
                  </dt>
                  <dd className="font-medium text-ink tabular">{plan.organizationCount}</dd>
                </div>
              </dl>

              {/* The number above is what makes withdrawing safe to judge, so
                  the warning sits right next to the button that does it. */}
              {plan.organizationCount > 0 && plan.isActive && (
                <p className="text-xs text-muted mt-4 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-caution" />
                  {plan.organizationCount} workspace{plan.organizationCount === 1 ? '' : 's'} on this
                  plan. Withdrawing it takes it off sale; they keep it.
                </p>
              )}

              <div className="flex flex-wrap gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => startEdit(plan)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border border-accent-soft text-accent"
                >
                  Edit
                </button>

                {plan.isActive ? (
                  <button
                    type="button"
                    onClick={() => void setAvailability(plan, false)}
                    disabled={plan.isDefault}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-line text-muted disabled:opacity-40"
                    title={plan.isDefault ? 'The default plan cannot be withdrawn.' : undefined}
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    Withdraw
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void setAvailability(plan, true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-line text-muted"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Put back on sale
                  </button>
                )}

                {!plan.isDefault && plan.pricePaise === 0 && plan.isActive && (
                  <button
                    type="button"
                    onClick={() => void makeDefault(plan)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-line text-muted"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Make default
                  </button>
                )}
              </div>

              {editingId === plan.id && (
                <PlanForm
                  draft={draft}
                  setDraft={setDraft}
                  isNew={false}
                  saving={saving}
                  onSubmit={save}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </div>
          ))
        )}
      </div>
    </DashboardLayout>
  );
};

export default PricingPlans;
