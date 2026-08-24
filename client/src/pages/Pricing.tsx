import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ArrowLeft } from 'lucide-react';
import api from '../services/api';
import { formatRupees, formatRupeesShort } from '../utils/money';
import Footer from '../components/Footer';

/**
 * Public pricing.
 *
 * Reads the same endpoint checkout does, so the number advertised here is by
 * construction the number that gets charged — including whether GST applies at
 * all, which depends on the supplier's registration and not on what looked
 * good when the page was written.
 */

interface PlanCard {
  id: 'FREE' | 'PRO' | 'ENTERPRISE';
  label: string;
  blurb: string;
  pricePaise: number;
  priceWithGstPaise: number;
  eventsPerMonth: number;
  participantsPerEvent: number;
  questionsPerEvent: number;
  branding: boolean;
}

const Pricing: React.FC = () => {
  const [plans, setPlans] = useState<PlanCard[]>([]);
  const [gstApplies, setGstApplies] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .get('/billing/plans')
      .then((res) => {
        setPlans(res.data.plans);
        setGstApplies(res.data.gstApplies !== false);
      })
      .catch(() => setFailed(true));
  }, []);

  const rows = (plan: PlanCard) => [
    `${plan.eventsPerMonth.toLocaleString('en-IN')} sessions a month`,
    `${plan.participantsPerEvent.toLocaleString('en-IN')} participants in a session`,
    `${plan.questionsPerEvent} questions in a session`,
    'Quizzes, polls, word clouds, ratings, rankings',
    'Audience Q&A with upvotes and moderation',
    ...(plan.branding ? ['Your logo and colours on the join screen'] : []),
  ];

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <div className="flex-1 max-w-5xl w-full mx-auto px-5 py-12">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted mb-8">
          <ArrowLeft className="w-4 h-4" />
          Back to QuizPulse
        </Link>

        <header className="text-center max-w-2xl mx-auto mb-12">
          <h1 className="font-heading text-4xl font-bold text-ink mb-3">
            One price for the whole room
          </h1>
          <p className="text-muted">
            Priced per workspace, not per person — invite your whole department without the bill
            moving. Monthly, and nothing renews on its own.
          </p>
        </header>

        {failed && (
          <p className="text-center text-sm text-muted">
            Pricing is unavailable right now. Please try again shortly.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
          {plans.map((plan) => {
            const isPaid = plan.pricePaise > 0;
            const featured = plan.id === 'PRO';

            return (
              <div
                key={plan.id}
                className={`rounded-2xl border p-6 flex flex-col h-full ${
                  featured ? 'border-accent bg-surface shadow-lg' : 'border-line bg-surface'
                }`}
              >
                {featured && (
                  <span className="self-start text-xs font-bold uppercase tracking-wider text-accent mb-2">
                    Most chosen
                  </span>
                )}

                <h2 className="font-heading text-xl font-semibold text-ink">{plan.label}</h2>

                {/* "Free · Free" reads like a bug. The plan is already named
                    above, so the price line states the figure either way. */}
                <p className="mt-3 text-3xl font-heading font-semibold text-ink tabular">
                  {formatRupeesShort(plan.pricePaise)}
                  <span className="text-sm font-sans font-medium text-muted"> /month</span>
                </p>
                <p className="text-xs text-muted mb-4 tabular min-h-4">
                  {isPaid &&
                    (gstApplies
                      ? `${formatRupees(plan.priceWithGstPaise)} incl. 18% GST`
                      : 'No GST charged')}
                </p>

                <p className="text-sm text-muted mb-5">{plan.blurb}</p>

                <ul className="space-y-2 text-sm text-ink-soft mb-6 flex-1">
                  {rows(plan).map((row) => (
                    <li key={row} className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-accent" />
                      <span>{row}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/signup"
                  className={`text-center px-5 py-3 rounded-xl text-sm font-semibold ${
                    featured
                      ? 'btn-primary'
                      : 'border border-accent-soft text-accent'
                  }`}
                >
                  {isPaid ? `Start on ${plan.label}` : 'Start free'}
                </Link>
              </div>
            );
          })}
        </div>

        <section className="mt-14 max-w-2xl mx-auto space-y-6 text-sm">
          <h2 className="font-heading text-xl font-semibold text-ink text-center mb-6">
            The awkward questions
          </h2>

          <div>
            <p className="font-semibold text-ink">Does it renew on its own?</p>
            <p className="text-muted">
              No. Each payment buys one month. You are never charged again unless you choose to pay
              again.
            </p>
          </div>

          <div>
            <p className="font-semibold text-ink">What happens when a paid month ends?</p>
            <p className="text-muted">
              Your workspace keeps working for a short grace period, then goes back to the free
              plan's limits. Nothing is deleted — your sessions and results stay exactly where they
              are.
            </p>
          </div>

          <div>
            <p className="font-semibold text-ink">Do participants need accounts?</p>
            <p className="text-muted">
              Never. They type a room code. Sessions can allow joining without a name at all.
            </p>
          </div>

          <div>
            <p className="font-semibold text-ink">Can I get a GST invoice?</p>
            <p className="text-muted">
              {gstApplies
                ? 'Yes. Add your GSTIN in billing settings and every invoice carries it, with the tax split by head so your accountant can file it.'
                : 'You receive a numbered bill of supply for every payment, downloadable from your billing settings.'}
            </p>
          </div>

          <div>
            <p className="font-semibold text-ink">How do I pay?</p>
            <p className="text-muted">
              UPI, cards, net banking and wallets, through Razorpay. Card and UPI details go
              straight to Razorpay and never reach us.
            </p>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
};

export default Pricing;
