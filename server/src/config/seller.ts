import { isValidGstin, isValidStateCode, SELLER_STATE_CODE, stateNameFor } from '../utils/gst';

/**
 * Who is selling. The other half of every tax invoice.
 *
 * Until now the only thing recorded about the supplier was a state code, used
 * to decide CGST+SGST versus IGST. That is enough to compute the tax and not
 * nearly enough to issue an invoice: rule 46 of the CGST Rules requires the
 * supplier's name, address and GSTIN on the face of the document. Invoices
 * issued without them are records of a payment, not tax invoices, and a buyer
 * cannot claim input credit against one.
 *
 * Kept in the environment rather than the database because it is a property of
 * the business running this deployment, not of any row in it.
 */

const read = (name: string): string | undefined => process.env[name]?.trim() || undefined;

export const seller = {
  legalName: read('SELLER_LEGAL_NAME') || 'QuizPulse',
  gstin: read('SELLER_GSTIN'),
  address: read('SELLER_ADDRESS'),
  email: read('SELLER_EMAIL'),
  stateCode: SELLER_STATE_CODE,
  get stateName(): string | null {
    return stateNameFor(SELLER_STATE_CODE);
  },
} as const;

/**
 * Whether what we hold is enough to put on a tax invoice.
 *
 * Deliberately not fatal. A workspace on the free tier never sees an invoice,
 * and refusing to boot over it would take down live sessions for a field that
 * only matters at the moment someone pays.
 */
export interface SellerIdentity {
  legalName?: string;
  gstin?: string;
  address?: string;
  stateCode: string;
}

/** The configured seller, as a plain value the checks below can be run against. */
const configured = (): SellerIdentity => ({
  legalName: read('SELLER_LEGAL_NAME'),
  gstin: seller.gstin,
  address: seller.address,
  stateCode: seller.stateCode,
});

/**
 * Whether this supplier may charge GST at all.
 *
 * Not a formatting question. A supplier below the registration threshold — or
 * simply not registered yet — has no authority to collect GST, and doing so
 * anyway is an offence under section 32 of the CGST Act. Everything downstream
 * branches on this before it considers where the buyer is.
 */
export const isGstRegistered = (identity: SellerIdentity = configured()): boolean =>
  Boolean(identity.gstin && isValidGstin(identity.gstin));

/**
 * What is missing before a document can be issued.
 *
 * A GSTIN is deliberately not required. An unregistered supplier issues a bill
 * of supply, which is a real document with its own rules, not a broken tax
 * invoice — so the absence of a GSTIN is a different mode, not a gap. What is
 * always required is who the supplier is and where they are.
 */
export const sellerIdentityGaps = (identity: SellerIdentity = configured()): string[] => {
  const gaps: string[] = [];

  if (!identity.legalName) gaps.push('SELLER_LEGAL_NAME');
  if (!identity.address) gaps.push('SELLER_ADDRESS');
  if (identity.gstin && !isValidGstin(identity.gstin)) {
    gaps.push('SELLER_GSTIN (set, but not a valid 15-character GSTIN)');
  }
  if (!isValidStateCode(identity.stateCode)) gaps.push('SELLER_STATE_CODE (not a real state code)');

  return gaps;
};

export const sellerIdentityComplete = (identity: SellerIdentity = configured()): boolean =>
  sellerIdentityGaps(identity).length === 0;

/**
 * A GSTIN's first two digits are the state it is registered in. If that
 * disagrees with SELLER_STATE_CODE, every invoice splits the tax the wrong way
 * — and the error is invisible, because both halves still add to 18%.
 */
export const sellerStateMismatch = (identity: SellerIdentity = configured()): string | null => {
  if (!identity.gstin || !isValidGstin(identity.gstin)) return null;
  const fromGstin = identity.gstin.slice(0, 2);
  return fromGstin === identity.stateCode
    ? null
    : `SELLER_GSTIN is registered in state ${fromGstin} but SELLER_STATE_CODE is ${identity.stateCode}. Every invoice will split CGST/SGST against the wrong state.`;
};
