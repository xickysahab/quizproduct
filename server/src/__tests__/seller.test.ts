import { describe, expect, it } from 'vitest';
import {
  sellerIdentityGaps,
  sellerIdentityComplete,
  sellerStateMismatch,
  isGstRegistered,
  SellerIdentity,
} from '../config/seller';

const complete: SellerIdentity = {
  legalName: 'QuizPulse Technologies Private Limited',
  gstin: '27AAPFU0939F1ZV',
  address: 'Floor 3, Anand Park, Aundh, Pune 411007',
  stateCode: '27',
};

describe('supplier identity on a tax invoice', () => {
  it('accepts a complete identity', () => {
    expect(sellerIdentityGaps(complete)).toEqual([]);
    expect(sellerIdentityComplete(complete)).toBe(true);
  });

  it('names each missing field rather than failing vaguely', () => {
    const gaps = sellerIdentityGaps({ stateCode: '27' });
    expect(gaps).toContain('SELLER_LEGAL_NAME');
    expect(gaps).toContain('SELLER_ADDRESS');
  });

  it('does not treat an absent GSTIN as a gap', () => {
    // A supplier below the registration threshold issues a bill of supply,
    // which is a real document with its own rules — not a tax invoice with a
    // field missing. Flagging it as incomplete would push whoever is setting
    // this up towards inventing a GSTIN to make the warning go away.
    const gaps = sellerIdentityGaps({ ...complete, gstin: undefined });
    expect(gaps).toEqual([]);
    expect(sellerIdentityComplete({ ...complete, gstin: undefined })).toBe(true);
  });

  it('does flag a GSTIN that is set but malformed', () => {
    // Absent is a decision; wrong is a typo, and a typo here silently taxes
    // every sale against a registration that does not exist.
    expect(sellerIdentityGaps({ ...complete, gstin: '27NOTAGSTIN' })).toEqual([
      'SELLER_GSTIN (set, but not a valid 15-character GSTIN)',
    ]);
  });

  it('rejects a seller state code that is not a real state', () => {
    // Without this the seller sits in a state that does not exist, and the
    // intra-state comparison can never match a real buyer.
    expect(sellerIdentityGaps({ ...complete, gstin: undefined, stateCode: '39' })).toContain(
      'SELLER_STATE_CODE (not a real state code)'
    );
  });
});

describe('seller state agreement', () => {
  it('is quiet when the GSTIN and the state code agree', () => {
    expect(sellerStateMismatch(complete)).toBeNull();
  });

  it('catches a GSTIN registered in a different state from the configured one', () => {
    // The dangerous case: both halves still add to 18%, so the totals look
    // right and only the split — which is what gets filed — is wrong.
    const message = sellerStateMismatch({ ...complete, stateCode: '29' });
    expect(message).toContain('registered in state 27');
    expect(message).toContain('SELLER_STATE_CODE is 29');
  });

  it('says nothing when there is no GSTIN to disagree with', () => {
    expect(sellerStateMismatch({ ...complete, gstin: undefined })).toBeNull();
  });
});

describe('whether this supplier may charge GST at all', () => {
  it('is registered with a valid GSTIN', () => {
    expect(isGstRegistered(complete)).toBe(true);
  });

  it('is not registered without one', () => {
    expect(isGstRegistered({ ...complete, gstin: undefined })).toBe(false);
  });

  it('is not registered with a malformed one', () => {
    // Charging 18% against a GSTIN that cannot exist is collecting tax with no
    // authority to collect it, which section 32 of the CGST Act makes an
    // offence. Failing closed is the only safe direction.
    expect(isGstRegistered({ ...complete, gstin: '27NOTAGSTIN' })).toBe(false);
  });
});
