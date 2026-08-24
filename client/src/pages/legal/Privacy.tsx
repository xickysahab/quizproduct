import React from 'react';
import LegalLayout, { Clause } from './LegalLayout';
import { useCompanyDetails } from '../../utils/legal';

/**
 * Privacy policy.
 *
 * Built from what the server actually records: the consent purposes it itemises
 * under DPDP §6, and the retention windows it enforces under §8(7). Those are
 * served by the API rather than restated here, so the policy cannot drift away
 * from the code the day someone adds a purpose or shortens a window.
 *
 * The unusual thing about this product is that most people whose data it holds
 * never signed up for it — they are participants who typed a room code. The
 * policy has to be honest about that rather than addressing only account
 * holders.
 */
const Privacy: React.FC = () => {
  const details = useCompanyDetails();
  const entity = details?.entity;
  const name = entity?.legalName ?? 'the operator of QuizPulse';
  const retention = details?.privacy.retentionDays;

  return (
    <LegalLayout title="Privacy policy" updated="24 August 2026" details={details}>
      <Clause title="Who holds your data">
        <p>
          <strong>{name}</strong>
          {entity?.address ? `, ${entity.address}` : ''} is the data fiduciary for account holders
          under the Digital Personal Data Protection Act 2023.
        </p>
        <p>
          For session data — participant names, answers and audience questions — the host running
          the session decides what is collected and why. We process it on their behalf.
        </p>
        {entity?.email && (
          <p>
            Privacy questions and DPDP requests: <strong>{entity.email}</strong>.
          </p>
        )}
      </Clause>

      <Clause title="If you joined a session">
        <p>
          You do not need an account to take part, and we do not ask you for one. Depending on how
          the host set the session up, we record:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>the name you typed — a name is required to join, so there is always one</li>
          <li>the answers you submit, and when you submitted them</li>
          <li>any question you ask the host, and whether you chose to attach your name to it</li>
          <li>
            a random identifier stored on your own device, so refreshing the page rejoins you as
            the same person instead of creating a duplicate
          </li>
        </ul>
        <p>
          We do not build a profile of you, track you across sessions, or use anything you submit
          for advertising. To have your contribution to a session removed, ask the host who ran it —
          they can anonymise a session's participants, and they are the ones who decided to collect
          it.
        </p>
      </Clause>

      <Clause title="If you hold an account">
        <p>
          We record your name, email address and a hashed password, the organisation you belong to,
          the sessions you create, and a log of significant actions taken in your workspace.
        </p>
        {details && (
          <>
            <p>Each purpose is consented to separately rather than bundled:</p>
            <ul className="list-disc pl-5 space-y-1">
              {details.privacy.purposes.map((purpose) => (
                <li key={purpose.key}>
                  <strong>{purpose.title}</strong>
                  {purpose.essential ? ' (required to hold an account)' : ' (optional)'} —{' '}
                  {purpose.description}
                </li>
              ))}
            </ul>
            <p className="text-muted text-xs">
              Consent policy version {details.privacy.policyVersion}. Your recorded consents are
              visible in your settings and can be withdrawn there.
            </p>
          </>
        )}
      </Clause>

      <Clause title="How long we keep it">
        {retention ? (
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Participant names and answers: <strong>{retention.sessionData} days</strong> after the
              session ends
            </li>
            <li>
              Activity logs: <strong>{retention.activityLogs} days</strong>
            </li>
            <li>
              Used or expired sign-in and password-reset links:{' '}
              <strong>{retention.tokens} days</strong>
            </li>
            <li>Account details: until you erase the account</li>
          </ul>
        ) : (
          <p>Retention windows are published by the service and enforced automatically.</p>
        )}
        <p>
          Billing records are kept for as long as tax law requires them, which is longer than the
          windows above and is not something we can shorten on request.
        </p>
      </Clause>

      <Clause title="Who else sees it">
        <p>We use a small number of processors, and no one else:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Razorpay</strong> — takes payments. Card and UPI details are entered on
            Razorpay's own form and never reach us.
          </li>
          <li>
            <strong>Resend</strong> — sends account email such as invitations and password resets.
          </li>
          <li>
            <strong>Amazon Web Services</strong> — hosts the service and its database.
          </li>
        </ul>
        <p>
          We do not sell personal data, share it with advertisers, or use it to train machine
          learning models.
        </p>
      </Clause>

      <Clause title="Your rights">
        <p>Under the DPDP Act you may:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>ask what we hold about you and get a copy</li>
          <li>have inaccurate details corrected</li>
          <li>withdraw consent for anything not required to run your account</li>
          <li>have your account and its data erased</li>
          <li>nominate someone to exercise these rights if you cannot</li>
        </ul>
        <p>
          Erasure is available directly from your settings and takes effect immediately — it removes
          your sessions along with their participants and answers. For anything else,{' '}
          {entity?.email ? `write to ${entity.email}` : 'contact us'} and we will respond within 30
          days.
        </p>
      </Clause>

      <Clause title="Security">
        <p>
          Passwords are hashed and never stored in a readable form. Traffic is encrypted in transit.
          Sessions can be protected with a passcode, and a room code can be retired so it stops
          working rather than staying live indefinitely.
        </p>
        <p>
          If a breach affects your data we will notify you and the Data Protection Board as the Act
          requires.
        </p>
      </Clause>
    </LegalLayout>
  );
};

export default Privacy;
