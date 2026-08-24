import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Printer, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import api from '../services/api';
import { formatRupees } from '../utils/money';

/**
 * A tax invoice, laid out to be printed.
 *
 * Deliberately not a styled marketing document. This is filed with a chartered
 * accountant and matched against a GSTR-2B, so what matters is that every field
 * rule 46 asks for is present and legible: both parties with their GSTINs, the
 * invoice number and date, the place of supply, the HSN/SAC, and the tax split
 * out by head rather than rolled into a total.
 *
 * Printing is the browser's own — a PDF library would be a dependency and a
 * rendering surface to maintain for something Cmd-P already does correctly.
 */

interface InvoiceDoc {
  id: string;
  number: string;
  issuedAt: string;
  status: string;
  plan: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  provider: string | null;
  providerRef: string | null;
  hsnSac: string;
  documentType: 'TAX_INVOICE' | 'BILL_OF_SUPPLY';
  placeOfSupply: string | null;
  placeOfSupplyName: string | null;
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxTotalPaise: number;
  totalPaise: number;
  isExport: boolean;
  gstRatePercent: number;
}

interface Party {
  legalName?: string;
  name?: string;
  gstin: string | null;
  address: string | null;
  email?: string | null;
  stateCode?: string;
  stateName?: string | null;
  complete?: boolean;
}

const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className={`flex justify-between py-1.5 ${strong ? 'text-ink font-semibold' : 'text-ink-soft'}`}>
    <span>{label}</span>
    <span className="tabular">{value}</span>
  </div>
);

const InvoiceView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<InvoiceDoc | null>(null);
  const [supplier, setSupplier] = useState<Party | null>(null);
  const [buyer, setBuyer] = useState<Party | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get(`/billing/invoices/${id}`)
      .then((res) => {
        setDoc(res.data.invoice);
        setSupplier(res.data.supplier);
        setBuyer(res.data.buyer);
      })
      .catch((err) => setError(err.response?.data?.message || 'Could not load that invoice.'));
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center gap-4 text-sm">
        <p className="text-muted">{error}</p>
        <Link to="/tenant/settings" className="text-accent font-semibold">
          Back to billing
        </Link>
      </div>
    );
  }

  if (!doc || !supplier || !buyer) {
    return <div className="min-h-screen bg-paper flex items-center justify-center text-sm text-muted">Loading…</div>;
  }

  const intraState = doc.cgstPaise > 0 || doc.sgstPaise > 0;
  // A bill of supply is what a supplier who is not GST-registered issues. It
  // is a complete document in its own right, not a tax invoice with the tax
  // rows removed, so it must not carry GST language anywhere.
  const isBillOfSupply = doc.documentType === 'BILL_OF_SUPPLY';

  return (
    <div className="min-h-screen bg-paper py-8 px-4">
      {/* Controls — not part of the document. */}
      <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <Link to="/tenant/settings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted">
          <ArrowLeft className="w-4 h-4" />
          Back to billing
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm"
        >
          <Printer className="w-4 h-4" />
          Print / Save as PDF
        </button>
      </div>

      {supplier.complete === false && (
        <div className="max-w-3xl mx-auto mb-4 rounded-xl bg-caution-wash text-caution px-4 py-3 text-sm font-medium print:hidden">
          <AlertTriangle className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          This document is missing supplier details every billing document must carry. Set
          SELLER_LEGAL_NAME and SELLER_ADDRESS on the server.
        </div>
      )}

      <div className="max-w-3xl mx-auto bg-surface border border-line rounded-2xl p-8 print:border-0 print:rounded-none print:p-0">
        <header className="flex flex-wrap justify-between gap-4 pb-6 border-b border-line">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-faint mb-1">
              {isBillOfSupply ? 'Bill of supply' : 'Tax invoice'}
            </p>
            <h1 className="text-2xl font-heading font-semibold text-ink tabular">{doc.number}</h1>
            <p className="text-sm text-muted mt-1">
              Issued {format(new Date(doc.issuedAt), 'd MMMM yyyy')}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-ink">{supplier.legalName}</p>
            {supplier.address && <p className="text-muted whitespace-pre-line max-w-56">{supplier.address}</p>}
            {supplier.gstin ? (
              <p className="text-muted font-mono mt-1">GSTIN {supplier.gstin}</p>
            ) : (
              <p className="text-muted mt-1">Not registered under GST</p>
            )}
            {supplier.email && <p className="text-muted">{supplier.email}</p>}
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-line text-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-faint mb-2">Billed to</p>
            <p className="font-semibold text-ink">{buyer.name}</p>
            {buyer.address && <p className="text-muted whitespace-pre-line">{buyer.address}</p>}
            {buyer.gstin && <p className="text-muted font-mono mt-1">GSTIN {buyer.gstin}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-faint mb-2">
              {isBillOfSupply ? 'Buyer location' : 'Place of supply'}
            </p>
            <p className="text-ink">
              {doc.placeOfSupplyName
                ? `${doc.placeOfSupplyName} (${doc.placeOfSupply})`
                : isBillOfSupply
                  ? 'Not recorded'
                  : 'Outside India — export of services'}
            </p>
            {doc.providerRef && (
              <p className="text-muted mt-2 font-mono text-xs break-all">
                {doc.provider} · {doc.providerRef}
              </p>
            )}
          </div>
        </section>

        <section className="py-6 border-b border-line">
          <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-faint pb-2 mb-2 border-b border-line-soft">
            <span>Description</span>
            <span>Amount</span>
          </div>
          <div className="flex justify-between text-sm">
            <div>
              <p className="text-ink font-medium">{doc.plan ?? 'Subscription'} plan — monthly subscription</p>
              <p className="text-muted text-xs mt-0.5">
                SAC {doc.hsnSac}
                {doc.periodStart && doc.periodEnd && (
                  <>
                    {' · '}
                    {format(new Date(doc.periodStart), 'd MMM yyyy')} to{' '}
                    {format(new Date(doc.periodEnd), 'd MMM yyyy')}
                  </>
                )}
              </p>
            </div>
            <span className="text-ink tabular">{formatRupees(doc.subtotalPaise)}</span>
          </div>
        </section>

        <section className="py-6 text-sm ml-auto sm:w-72">
          <Row
            label={isBillOfSupply ? 'Value of supply' : 'Taxable value'}
            value={formatRupees(doc.subtotalPaise)}
          />
          {isBillOfSupply ? (
            <p className="text-xs text-muted py-1.5">
              No GST charged — the supplier is not registered under GST.
            </p>
          ) : doc.isExport ? (
            <p className="text-xs text-muted py-1.5">
              Zero-rated export of services. No GST charged.
            </p>
          ) : intraState ? (
            <>
              <Row label={`CGST @ ${doc.gstRatePercent / 2}%`} value={formatRupees(doc.cgstPaise)} />
              <Row label={`SGST @ ${doc.gstRatePercent / 2}%`} value={formatRupees(doc.sgstPaise)} />
            </>
          ) : (
            <Row label={`IGST @ ${doc.gstRatePercent}%`} value={formatRupees(doc.igstPaise)} />
          )}
          <div className="border-t border-line mt-2 pt-2">
            <Row label="Total" value={formatRupees(doc.totalPaise)} strong />
          </div>
        </section>

        <footer className="pt-6 border-t border-line text-xs text-muted space-y-2">
          {isBillOfSupply && (
            <p>
              The supplier is not registered under GST. No tax is charged on this supply and no
              input tax credit is available against this document.
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <span>Status: {doc.status}</span>
            <span>
              Computer-generated {isBillOfSupply ? 'bill of supply' : 'invoice'} — no signature
              required.
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default InvoiceView;
