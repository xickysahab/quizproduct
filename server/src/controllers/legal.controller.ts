import { Request, Response } from 'express';
import { seller, sellerIdentityGaps, isGstRegistered } from '../config/seller';
import { CONSENT_PURPOSES, POLICY_VERSION, RETENTION_DAYS } from '../utils/consent';

/**
 * The facts the public legal pages are built from.
 *
 * Terms, a privacy policy and a refund policy are not decoration — a payment
 * gateway will not activate an account without them, and a customer is
 * entitled to know who they are contracting with. Every concrete detail on
 * those pages is served from here rather than typed into the markup, so there
 * is one place the registered entity is stated and no page can drift into
 * claiming something the business is not.
 *
 * `complete` is reported honestly. A legal page that names no legal entity is
 * worse than no page, because it looks like one.
 */
export const getCompanyDetails = async (_req: Request, res: Response): Promise<void> => {
  const gaps = sellerIdentityGaps();

  res.json({
    entity: {
      legalName: seller.legalName,
      address: seller.address ?? null,
      email: seller.email ?? null,
      gstin: seller.gstin ?? null,
      gstRegistered: isGstRegistered(),
      stateName: seller.stateName,
    },
    /// What the pages cannot truthfully state yet.
    missing: gaps,
    complete: gaps.length === 0,
    privacy: {
      policyVersion: POLICY_VERSION,
      /// Named so the policy can list them rather than describing data use in
      /// the abstract, which is what DPDP §6 requires consent to avoid.
      purposes: CONSENT_PURPOSES,
      retentionDays: RETENTION_DAYS,
    },
  });
};
