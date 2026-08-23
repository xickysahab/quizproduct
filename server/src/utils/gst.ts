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
}

/** GSTIN: 2-digit state code, 10-char PAN, entity digit, 'Z', checksum. */
const GSTIN_PATTERN = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const isValidGstin = (value: string): boolean =>
  GSTIN_PATTERN.test(value.trim().toUpperCase());

/** The state code is the first two characters of a GSTIN. */
export const stateCodeFromGstin = (gstin: string): string | null =>
  isValidGstin(gstin) ? gstin.trim().toUpperCase().slice(0, 2) : null;

/**
 * Splits a pre-tax amount into its GST components.
 *
 * `buyerStateCode` null means the buyer is outside India: an export of
 * services, zero-rated, so no GST is charged at all.
 */
export const computeGst = (
  subtotalPaise: number,
  buyerStateCode: string | null,
  sellerStateCode = SELLER_STATE_CODE
): TaxBreakdown => {
  const subtotal = Math.max(0, Math.round(subtotalPaise));

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
