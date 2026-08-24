import React from 'react';
import { Mail, MapPin, Receipt } from 'lucide-react';
import LegalLayout, { Clause } from './LegalLayout';
import { useCompanyDetails } from '../../utils/legal';

/**
 * Contact.
 *
 * A payment gateway's reviewer looks for a real address and a reachable email
 * before activating an account, and a buyer looks for the same thing before
 * trusting one. Everything here comes from the server's configured entity, so
 * there is no address on this page that the business has not actually stated.
 */
const Contact: React.FC = () => {
  const details = useCompanyDetails();
  const entity = details?.entity;

  return (
    <LegalLayout title="Contact" updated="24 August 2026" details={details}>
      <Clause title="Who we are">
        <p className="text-base font-semibold text-ink">
          {entity?.legalName ?? 'The operator of QuizPulse'}
        </p>

        {entity?.address && (
          <p className="flex items-start gap-2">
            <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted" />
            <span className="whitespace-pre-line">{entity.address}</span>
          </p>
        )}

        {entity?.email && (
          <p className="flex items-center gap-2">
            <Mail className="w-4 h-4 shrink-0 text-muted" />
            <a href={`mailto:${entity.email}`} className="text-accent font-medium">
              {entity.email}
            </a>
          </p>
        )}

        {entity?.gstin && (
          <p className="flex items-center gap-2 font-mono text-xs">
            <Receipt className="w-4 h-4 shrink-0 text-muted" />
            GSTIN {entity.gstin}
          </p>
        )}
      </Clause>

      <Clause title="What to write to us about">
        <ul className="list-disc pl-5 space-y-1">
          <li>Billing, invoices and refunds — include the invoice number</li>
          <li>Privacy requests under the DPDP Act</li>
          <li>Something wrong during a live session — tell us the room code and roughly when</li>
          <li>Reporting misuse of a session or of the service</li>
        </ul>
        <p>
          We reply within 3 working days. For something going wrong in a session that is happening
          right now, say so in the subject line.
        </p>
      </Clause>

      <Clause title="If you took part in someone's session">
        <p>
          To have your name or answers removed from a session you joined, ask the host who ran it.
          They chose what to collect and they can anonymise their session's participants directly.
          We can only act on their instruction.
        </p>
      </Clause>
    </LegalLayout>
  );
};

export default Contact;
