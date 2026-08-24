import React from 'react';
import LegalLayout, { Clause } from './LegalLayout';
import { useCompanyDetails } from '../../utils/legal';

/**
 * Terms of service.
 *
 * Written against what this product actually does — room codes, live sessions,
 * participant data held on the host's behalf, monthly workspace plans — rather
 * than adapted from a template for a generic web app. A term that does not
 * describe the service is not enforceable and is not useful to anyone reading
 * it to decide whether to buy.
 *
 * Not a substitute for a lawyer's review before this is relied on.
 */
const Terms: React.FC = () => {
  const details = useCompanyDetails();
  const entity = details?.entity;
  const name = entity?.legalName ?? 'the operator of QuizPulse';

  return (
    <LegalLayout title="Terms of service" updated="24 August 2026" details={details}>
      <Clause title="Who these terms are with">
        <p>
          QuizPulse is operated by <strong>{name}</strong>
          {entity?.address ? `, ${entity.address}` : ''}
          {entity?.gstin ? ` (GSTIN ${entity.gstin})` : ''}. In these terms, "we" and "us" mean{' '}
          {name}, and "you" means the person or organisation holding an account.
        </p>
        <p>
          By creating an account or running a session you accept these terms. If you are accepting
          on behalf of an organisation, you confirm you are authorised to do so.
        </p>
      </Clause>

      <Clause title="What the service is">
        <p>
          QuizPulse hosts live quizzes, polls and audience questions. A host creates a session,
          participants join it with a room code, and answers are collected and shown in real time.
        </p>
        <p>
          Participants are not required to hold an account. Where a session allows anonymous
          joining, no name is collected from them at all.
        </p>
      </Clause>

      <Clause title="Your account">
        <p>
          You are responsible for what happens under your account, including keeping your password
          to yourself and choosing who in your organisation you invite into your workspace. Tell us
          promptly if you believe someone else has access to it.
        </p>
        <p>
          One person may not share a single host login as a way of avoiding plan limits. Staff
          accounts within a workspace are the supported way to give colleagues access.
        </p>
      </Clause>

      <Clause title="Plans and limits">
        <p>
          Each plan carries limits on sessions per month, participants per session, and questions
          per session. These are enforced by the service, and reaching one stops the action rather
          than incurring an extra charge. Your current limits and usage are shown in your workspace
          settings.
        </p>
        <p>
          Paid plans run for one month from the date of payment. Access continues for a short grace
          period after a period ends, after which the workspace returns to the free plan's limits.
          Data is not deleted when a plan lapses.
        </p>
      </Clause>

      <Clause title="Content you and your participants put in">
        <p>
          You own what you create — your questions, your session results, your branding. We store
          and process it to run the service for you and do not sell it, use it to train models, or
          disclose it to anyone except as described in the privacy policy.
        </p>
        <p>
          Audience questions and open-text answers are submitted by participants and shown to a
          room, sometimes on a screen in front of it. Moderation controls are provided; using them
          is your decision, and what a session displays is your responsibility as its host.
        </p>
      </Clause>

      <Clause title="Acceptable use">
        <p>You may not use the service to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>break the law, or help anyone else to</li>
          <li>harass, defame or endanger anyone, including through content shown to a room</li>
          <li>collect personal information from participants that the session does not need</li>
          <li>probe, overload or interfere with the service or the people using it</li>
          <li>resell access, or run it as a service for others, without a written agreement</li>
        </ul>
        <p>
          We may suspend a workspace that is doing any of these. Where it is safe and lawful to do
          so, we will say why first.
        </p>
      </Clause>

      <Clause title="Availability">
        <p>
          We work to keep the service running, and we do not promise it will never be unavailable.
          Live sessions depend on your network and your participants' devices as much as on us.
          Planned maintenance is scheduled outside common session hours where we can.
        </p>
      </Clause>

      <Clause title="Ending the arrangement">
        <p>
          You may stop using the service at any time and may request erasure of your account and its
          data from your settings. Doing so removes your sessions, their participants and their
          answers, and cannot be undone.
        </p>
        <p>
          We may end this arrangement on notice, or immediately where an account is being used in a
          way that harms others. Where we end it without cause, any unused portion of a paid month
          is refunded.
        </p>
      </Clause>

      <Clause title="Liability">
        <p>
          Nothing here limits liability that cannot lawfully be limited. Subject to that, our total
          liability for any claim is limited to the amount you paid us in the twelve months before
          it arose, and we are not liable for lost profits or for indirect loss.
        </p>
      </Clause>

      <Clause title="Changes and governing law">
        <p>
          We may change these terms. Where a change materially reduces what you get, we will tell
          account holders by email before it takes effect.
        </p>
        <p>
          These terms are governed by the laws of India, and the courts of{' '}
          {entity?.stateName ?? 'the state in which we are registered'} have exclusive jurisdiction.
        </p>
      </Clause>
    </LegalLayout>
  );
};

export default Terms;
