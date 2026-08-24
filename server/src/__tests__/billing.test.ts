import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import {
  computeGst,
  isValidGstin,
  stateCodeFromGstin,
  financialYear,
  formatInvoiceNumber,
  isValidStateCode,
  stateNameFor,
  selectableStates,
  treatmentFor,
  documentTypeFor,
  placeOfSupplyRequired,
  GST_RATE,
} from '../utils/gst';
import { verifyStripeSignature, verifyRazorpaySignature, safeEquals } from '../utils/webhookSignature';

describe('GST computation (IN-02)', () => {
  const SELLER = '27'; // Maharashtra

  it('splits intra-state supply into CGST and SGST', () => {
    const tax = computeGst(100_000, '27', SELLER);
    expect(tax.cgstPaise).toBe(9_000);
    expect(tax.sgstPaise).toBe(9_000);
    expect(tax.igstPaise).toBe(0);
    expect(tax.totalPaise).toBe(118_000);
  });

  it('charges IGST on inter-state supply', () => {
    const tax = computeGst(100_000, '29', SELLER); // Karnataka buyer
    expect(tax.igstPaise).toBe(18_000);
    expect(tax.cgstPaise).toBe(0);
    expect(tax.sgstPaise).toBe(0);
    expect(tax.totalPaise).toBe(118_000);
  });

  it('treats a buyer outside India as a zero-rated export', () => {
    const tax = computeGst(100_000, null, SELLER);
    expect(tax.isExport).toBe(true);
    expect(tax.totalPaise).toBe(100_000);
    expect(tax.cgstPaise + tax.sgstPaise + tax.igstPaise).toBe(0);
  });

  it('never loses a paisa when the tax splits unevenly', () => {
    // 1499_00 * 18% = 26982 paise, an odd number that cannot halve evenly.
    const tax = computeGst(149_900, '27', SELLER);
    expect(tax.cgstPaise + tax.sgstPaise).toBe(Math.round(149_900 * GST_RATE));
    expect(tax.subtotalPaise + tax.cgstPaise + tax.sgstPaise).toBe(tax.totalPaise);
  });

  it('keeps components consistent with the total across many amounts', () => {
    for (let paise = 1; paise <= 500_000; paise += 997) {
      const intra = computeGst(paise, '27', SELLER);
      expect(intra.subtotalPaise + intra.cgstPaise + intra.sgstPaise + intra.igstPaise).toBe(intra.totalPaise);

      const inter = computeGst(paise, '29', SELLER);
      expect(inter.subtotalPaise + inter.igstPaise).toBe(inter.totalPaise);
    }
  });

  it('treats a zero-priced plan as free of tax', () => {
    // 18% of nothing is nothing — worth pinning, because a free tier still
    // goes through the same tax path as a paid one.
    expect(computeGst(0, '27', SELLER).totalPaise).toBe(0);
  });
});

describe('GSTIN validation', () => {
  it('accepts a well-formed GSTIN', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
  });

  it('rejects wrong length and wrong shape', () => {
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);
    expect(isValidGstin('AAPFU0939F1ZV27')).toBe(false);
    expect(isValidGstin('')).toBe(false);
  });

  it('reads the state code from the GSTIN so the two cannot disagree', () => {
    expect(stateCodeFromGstin('27AAPFU0939F1ZV')).toBe('27');
    expect(stateCodeFromGstin('not-a-gstin')).toBeNull();
  });
});

describe('invoice numbering', () => {
  it('runs the series on the Indian financial year, April to March', () => {
    expect(financialYear(new Date('2026-04-01T00:00:00Z'))).toBe('2026-27');
    expect(financialYear(new Date('2026-03-31T00:00:00Z'))).toBe('2025-26');
  });

  it('zero-pads sequentially', () => {
    expect(formatInvoiceNumber(7, new Date('2026-05-01T00:00:00Z'))).toBe('QP/2026-27/00007');
  });
});

describe('webhook signature verification (BUG-16)', () => {
  const secret = 'whsec_test_secret';
  const body = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }));

  const stripeHeader = (timestampSeconds: number) => {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestampSeconds}.${body.toString('utf8')}`)
      .digest('hex');
    return `t=${timestampSeconds},v1=${signature}`;
  };

  it('accepts a correctly signed, current payload', () => {
    const now = Date.now();
    expect(verifyStripeSignature(body, stripeHeader(Math.floor(now / 1000)), secret, 300, now).ok).toBe(true);
  });

  it('rejects a replayed payload from outside the tolerance window', () => {
    // The signature is still valid — this is exactly the replay attack the old
    // code allowed, because it never looked at the timestamp.
    const now = Date.now();
    const result = verifyStripeSignature(body, stripeHeader(Math.floor(now / 1000) - 3600), secret, 300, now);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('timestamp');
  });

  it('rejects a future-dated timestamp too', () => {
    const now = Date.now();
    const result = verifyStripeSignature(body, stripeHeader(Math.floor(now / 1000) + 3600), secret, 300, now);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('timestamp');
  });

  it('rejects a tampered body', () => {
    const now = Date.now();
    const header = stripeHeader(Math.floor(now / 1000));
    const tampered = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'invoice.paid' }));
    expect(verifyStripeSignature(tampered, header, secret, 300, now).ok).toBe(false);
  });

  it('rejects a missing or malformed header', () => {
    const now = Date.now();
    expect(verifyStripeSignature(body, undefined, secret, 300, now).reason).toBe('malformed');
    expect(verifyStripeSignature(body, 'garbage', secret, 300, now).reason).toBe('malformed');
  });

  it('verifies a Razorpay signature over the raw body', () => {
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyRazorpaySignature(body, signature, secret).ok).toBe(true);
    expect(verifyRazorpaySignature(body, 'wrong', secret).ok).toBe(false);
    expect(verifyRazorpaySignature(body, undefined, secret).ok).toBe(false);
  });
});

describe('constant-time comparison', () => {
  it('matches identical strings and rejects differing ones', () => {
    expect(safeEquals('abc', 'abc')).toBe(true);
    expect(safeEquals('abc', 'abd')).toBe(false);
  });

  it('handles different lengths without throwing', () => {
    // timingSafeEqual throws on length mismatch, so this must be guarded.
    expect(safeEquals('short', 'much longer string')).toBe(false);
  });
});

describe('GST state codes', () => {
  it('accepts a real state code', () => {
    expect(isValidStateCode('27')).toBe(true);
    expect(isValidStateCode('07')).toBe(true);
  });

  it('rejects codes the old [0-3][0-9] pattern let through', () => {
    // "00" and "39" are not states, and a place of supply that is not a state
    // makes the invoice unfilable.
    expect(isValidStateCode('00')).toBe(false);
    expect(isValidStateCode('39')).toBe(false);
  });

  it('rejects anything that is not two digits', () => {
    expect(isValidStateCode('')).toBe(false);
    expect(isValidStateCode('MH')).toBe(false);
    expect(isValidStateCode('270')).toBe(false);
  });

  it('names a state for the invoice', () => {
    expect(stateNameFor('27')).toBe('Maharashtra');
    expect(stateNameFor('33')).toBe('Tamil Nadu');
    expect(stateNameFor(null)).toBeNull();
    expect(stateNameFor('99')).toBeNull();
  });

  it('keeps merged and split states out of the picker but still valid', () => {
    // 25 merged into 26 in 2020; 28 was split in 2014. Historic GSTINs
    // carrying them must still validate.
    expect(isValidStateCode('25')).toBe(true);
    expect(isValidStateCode('28')).toBe(true);
    const selectable = selectableStates().map((state) => state.code);
    expect(selectable).not.toContain('25');
    expect(selectable).not.toContain('28');
    expect(selectable).toContain('27');
  });

  it('agrees with the state a GSTIN encodes', () => {
    const gstin = '27AAPFU0939F1ZV';
    const code = stateCodeFromGstin(gstin);
    expect(code).toBe('27');
    expect(isValidStateCode(code!)).toBe(true);
  });
});

describe('how a sale is taxed and what document it produces', () => {
  const REGISTERED = '27AAPFU0939F1ZV';

  it('charges GST when a registered supplier sells to an Indian buyer', () => {
    expect(treatmentFor({ sellerGstin: REGISTERED, buyerCountry: 'IN' })).toBe('GST');
  });

  it('zero-rates a registered supplier selling abroad', () => {
    expect(treatmentFor({ sellerGstin: REGISTERED, buyerCountry: 'US' })).toBe('EXPORT');
  });

  it('charges nothing when the supplier is not registered, wherever the buyer is', () => {
    // Registration is the first branch, before the buyer is considered at all.
    expect(treatmentFor({ sellerGstin: null, buyerCountry: 'IN' })).toBe('UNREGISTERED');
    expect(treatmentFor({ sellerGstin: undefined, buyerCountry: 'US' })).toBe('UNREGISTERED');
    expect(treatmentFor({ sellerGstin: 'not-a-gstin', buyerCountry: 'IN' })).toBe('UNREGISTERED');
  });

  it('calls the document what it legally is', () => {
    expect(documentTypeFor('GST')).toBe('TAX_INVOICE');
    expect(documentTypeFor('EXPORT')).toBe('TAX_INVOICE');
    expect(documentTypeFor('UNREGISTERED')).toBe('BILL_OF_SUPPLY');
  });

  it('adds no tax at all for an unregistered supplier', () => {
    const tax = computeGst(149_900, '27', '27', 'UNREGISTERED');
    expect(tax.totalPaise).toBe(149_900);
    expect(tax.cgstPaise + tax.sgstPaise + tax.igstPaise).toBe(0);
    // Not an export — that is zero-rated GST, this is no GST. The document
    // has to be able to tell the two apart.
    expect(tax.isExport).toBe(false);
    expect(tax.isUnregistered).toBe(true);
  });

  it('still charges an Indian buyer once the supplier registers', () => {
    const tax = computeGst(149_900, '27', '27', 'GST');
    expect(tax.totalPaise).toBe(176_882);
    expect(tax.isUnregistered).toBeUndefined();
  });

  it('only demands a place of supply when it changes the tax', () => {
    expect(placeOfSupplyRequired('GST')).toBe(true);
    expect(placeOfSupplyRequired('EXPORT')).toBe(false);
    expect(placeOfSupplyRequired('UNREGISTERED')).toBe(false);
  });
});
