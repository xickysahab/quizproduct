/**
 * Indian GST for a SaaS subscription.
 *
 * SaaS is an OIDAR service under HSN/SAC 998434, taxed at 18%. Whether that
 * 18% is split CGST+SGST or charged as IGST depends on where the buyer is
 * relative to the seller — not on the amount.
 *
 * All money is in paise. Rupees as floats would drift, and a tax invoice that
 * is off by a paisa is a tax invoice that gets rejected.
 */

export const GST_RATE = 0.18;
export const SAC_CODE = '998434';

/** Where the business is registered. Decides intra- vs inter-state supply. */
export const SELLER_STATE_CODE = process.env.SELLER_STATE_CODE?.trim() || '27'; // 27 = Maharashtra

export interface TaxBreakdown {
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  /** True when no Indian GST applies — an export of services. */
  isExport: boolean;
  /** True when the supplier is not GST-registered, so none was charged. */
  isUnregistered?: boolean;
}

/** GSTIN: 2-digit state code, 10-char PAN, entity digit, 'Z', checksum. */
const GSTIN_PATTERN = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const isValidGstin = (value: string): boolean =>
  GSTIN_PATTERN.test(value.trim().toUpperCase());

/** The state code is the first two characters of a GSTIN. */
export const stateCodeFromGstin = (gstin: string): string | null =>
  isValidGstin(gstin) ? gstin.trim().toUpperCase().slice(0, 2) : null;

/**
 * How a sale should be taxed and documented.
 *
 * The question the rest of the billing code kept skipping. GST is not simply
 * "18% on Indian buyers" — a supplier who is not registered has no authority
 * to collect it at all. Section 32 of the CGST Act makes collecting tax while
 * unregistered an offence, and the document such a supplier issues is a bill
 * of supply, not a tax invoice, because there is no tax to invoice.
 *
 * Registration is therefore the first branch, before anything about the buyer
 * is considered.
 */
export type TaxTreatment =
  /** Supplier is not registered: no GST, bill of supply. */
  | 'UNREGISTERED'
  /** Registered supplier, buyer outside India: zero-rated export of services. */
  | 'EXPORT'
  /** Registered supplier, Indian buyer: GST applies. */
  | 'GST';

export interface SaleContext {
  /** The supplier's GSTIN, or undefined if not registered. */
  sellerGstin?: string | null;
  /** ISO-3166 alpha-2 of the buyer. */
  buyerCountry: string;
  /** Two-digit state code, required when the buyer is in India. */
  buyerStateCode?: string | null;
}

export const treatmentFor = ({ sellerGstin, buyerCountry }: SaleContext): TaxTreatment => {
  if (!sellerGstin || !isValidGstin(sellerGstin)) return 'UNREGISTERED';
  return buyerCountry === 'IN' ? 'GST' : 'EXPORT';
};

/** What the document is called, which follows entirely from the treatment. */
export const documentTypeFor = (treatment: TaxTreatment): 'TAX_INVOICE' | 'BILL_OF_SUPPLY' =>
  treatment === 'UNREGISTERED' ? 'BILL_OF_SUPPLY' : 'TAX_INVOICE';

/**
 * A buyer's place of supply only has to be on file when it changes the tax.
 *
 * An unregistered supplier charges nothing either way, so demanding a state
 * before checkout would block a sale to collect a field nothing reads.
 */
export const placeOfSupplyRequired = (treatment: TaxTreatment): boolean => treatment === 'GST';

/**
 * Splits a pre-tax amount into its GST components.
 *
 * `buyerStateCode` null means the buyer is outside India: an export of
 * services, zero-rated, so no GST is charged at all.
 */
export const computeGst = (
  subtotalPaise: number,
  buyerStateCode: string | null,
  sellerStateCode = SELLER_STATE_CODE,
  treatment: TaxTreatment = 'GST'
): TaxBreakdown => {
  const subtotal = Math.max(0, Math.round(subtotalPaise));

  // No registration, no tax — and not as an export either. The distinction
  // matters on the document: an export is zero-rated GST, this is no GST.
  if (treatment === 'UNREGISTERED') {
    return {
      subtotalPaise: subtotal,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      totalPaise: subtotal,
      isExport: false,
      isUnregistered: true,
    };
  }

  if (!buyerStateCode) {
    return {
      subtotalPaise: subtotal,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      totalPaise: subtotal,
      isExport: true,
    };
  }

  const totalTax = Math.round(subtotal * GST_RATE);

  if (buyerStateCode === sellerStateCode) {
    // Intra-state: split equally, with any odd paisa going to CGST so the two
    // halves always add back to exactly the total tax.
    const cgst = Math.ceil(totalTax / 2);
    const sgst = totalTax - cgst;
    return {
      subtotalPaise: subtotal,
      cgstPaise: cgst,
      sgstPaise: sgst,
      igstPaise: 0,
      totalPaise: subtotal + totalTax,
      isExport: false,
    };
  }

  return {
    subtotalPaise: subtotal,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: totalTax,
    totalPaise: subtotal + totalTax,
    isExport: false,
  };
};

/**
 * GST state codes.
 *
 * The first two digits of a GSTIN, and what decides CGST+SGST versus IGST on
 * every invoice. Validating with a `[0-3][0-9]` pattern — which is what the
 * previous version did — accepts "00" and "39", neither of which is a state,
 * and a place of supply that is not a state makes the invoice unfilable.
 *
 * `deprecated` entries stay here so historic GSTINs still validate: 25 was
 * merged into 26 in 2020 and 28 was split into 36 and 37 in 2014. They are
 * kept out of the picker so nobody newly selects one.
 */
export interface GstState {
  code: string;
  name: string;
  deprecated?: boolean;
}

export const GST_STATES: GstState[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '25', name: 'Daman and Diu', deprecated: true },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh (pre-2014)', deprecated: true },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
];

const STATE_BY_CODE = new Map(GST_STATES.map((state) => [state.code, state]));

export const isValidStateCode = (value: string): boolean =>
  STATE_BY_CODE.has(value.trim());

export const stateNameFor = (code: string | null | undefined): string | null =>
  (code && STATE_BY_CODE.get(code.trim())?.name) || null;

/** What a buyer may pick. Excludes codes that no longer exist. */
export const selectableStates = (): GstState[] => GST_STATES.filter((state) => !state.deprecated);

/** Indian financial year runs April–March; invoice series resets with it. */
export const financialYear = (date = new Date()): string => {
  const year = date.getUTCFullYear();
  const startYear = date.getUTCMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
};

export const formatInvoiceNumber = (sequence: number, date = new Date()): string =>
  `QP/${financialYear(date)}/${String(sequence).padStart(5, '0')}`;

/** Paise → a rupee string for display. */
export const formatRupees = (paise: number): string =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
