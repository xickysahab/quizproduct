import React from 'react';
import LegalLayout, { Clause } from './LegalLayout';
import { useCompanyDetails } from '../../utils/legal';

/**
 * Refunds and cancellation.
 *
 * Required before a payment gateway will activate an account, and the page a
 * customer looks for before paying. The policy it states is the one the code
 * actually implements: monthly periods, a grace window, no auto-charge, and no
 * data loss on lapse. Promising anything else here would be a promise nothing
 * enforces.
 */
const Refunds: React.FC = () => {
  const details = useCompanyDetails();
  const entity = details?.entity;

  return (
    <LegalLayout title="Refunds & cancellation" updated="24 August 2026" details={details}>
      <Clause title="What you are buying">
        <p>
          A QuizPulse plan is a monthly subscription for one workspace, priced per workspace rather
          than per person. Payment covers one month from the date it is taken.
        </p>
      </Clause>

      <Clause title="Cancelling">
        <p>
          There is nothing to cancel. Each payment buys one month and nothing renews automatically —
          you are never charged again unless you choose to pay again. To stop, simply do not renew.
        </p>
        <p>
          When a paid month ends, your workspace keeps working for a short grace period and then
          returns to the free plan's limits. <strong>Nothing is deleted.</strong> Your sessions,
          questions and results stay exactly where they are, and paying again restores your limits
          immediately.
        </p>
      </Clause>

      <Clause title="Refunds">
        <p>We will refund you in full if:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            you were charged twice for the same month, or charged after you had already stopped
          </li>
          <li>
            the service was unavailable for a substantial part of the month you paid for, and that
            was our fault
          </li>
          <li>you ask within <strong>7 days</strong> of a payment and have not run a paid session on it</li>
        </ul>
        <p>
          Outside those cases we do not refund part-used months, because a month that has been used
          to run sessions has been delivered.
        </p>
      </Clause>

      <Clause title="How to ask">
        <p>
          {entity?.email ? (
            <>
              Write to <strong>{entity.email}</strong> from the email address on the account, with
              the invoice number.
            </>
          ) : (
            'Write to us from the email address on the account, with the invoice number.'
          )}{' '}
          Invoice numbers are on the billing page in your workspace settings.
        </p>
        <p>
          We reply within 3 working days. Approved refunds go back to the original payment method
          through Razorpay and usually appear within 5–7 working days, depending on your bank.
        </p>
      </Clause>

      <Clause title="Failed and disputed payments">
        <p>
          If a payment fails, nothing is charged and nothing changes on your workspace — try again
          when you are ready.
        </p>
        <p>
          If money left your account but your plan did not change, do not pay again. Send us the
          payment reference and we will either apply the plan or refund it.
        </p>
      </Clause>
    </LegalLayout>
  );
};

export default Refunds;
