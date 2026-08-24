import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { LEGAL_PAGES } from '../../utils/legal';
import type { CompanyDetails } from '../../utils/legal';

/**
 * The shell every legal page sits in, and the one place company details are
 * fetched.
 *
 * The pages state obligations on behalf of a real registered business, so the
 * business has to be named. While the server has no entity configured, that is
 * said out loud at the top rather than papered over with a placeholder — a
 * policy naming "Company Name Pvt Ltd" reads as real to a customer and is not.
 */

/** Section heading and body, so every page reads the same way. */
export const Clause: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="space-y-2">
    <h2 className="font-heading text-lg font-semibold text-ink">{title}</h2>
    <div className="text-sm text-ink-soft leading-relaxed space-y-3">{children}</div>
  </section>
);

interface Props {
  title: string;
  updated: string;
  details: CompanyDetails | null;
  children: React.ReactNode;
}

const LegalLayout: React.FC<Props> = ({ title, updated, details, children }) => (
  <div className="min-h-screen bg-paper">
    <div className="max-w-3xl mx-auto px-5 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to QuizPulse
      </Link>

      <h1 className="font-heading text-3xl font-bold text-ink mb-1">{title}</h1>
      <p className="text-sm text-muted mb-8">Last updated {updated}</p>

      {details && !details.complete && (
        <div className="rounded-xl bg-caution-wash text-caution px-4 py-3 text-sm font-medium mb-8">
          <AlertTriangle className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          This page does not yet name a registered business. Set {details.missing.join(', ')} on the
          server before relying on it or submitting it to a payment gateway.
        </div>
      )}

      <div className="card p-7 space-y-7">{children}</div>

      <nav className="flex flex-wrap gap-x-5 gap-y-2 mt-8 text-sm">
        {LEGAL_PAGES.map((page) => (
          <Link key={page.to} to={page.to} className="text-muted hover:text-accent">
            {page.label}
          </Link>
        ))}
      </nav>
    </div>
  </div>
);

export default LegalLayout;
