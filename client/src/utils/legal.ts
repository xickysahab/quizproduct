import { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * The company details every legal page is built from.
 *
 * Kept out of the layout component so that file exports only components —
 * mixing the two breaks fast refresh, and these are shared by four pages
 * anyway.
 */

export interface Entity {
  legalName: string;
  address: string | null;
  email: string | null;
  gstin: string | null;
  gstRegistered: boolean;
  stateName: string | null;
}

export interface ConsentPurpose {
  key: string;
  title: string;
  description: string;
  essential: boolean;
}

export interface CompanyDetails {
  entity: Entity;
  missing: string[];
  complete: boolean;
  privacy: {
    policyVersion: string;
    purposes: ConsentPurpose[];
    retentionDays: { sessionData: number; activityLogs: number; tokens: number };
  };
}

export const LEGAL_PAGES = [
  { to: '/legal/terms', label: 'Terms of service' },
  { to: '/legal/privacy', label: 'Privacy policy' },
  { to: '/legal/refunds', label: 'Refunds & cancellation' },
  { to: '/legal/contact', label: 'Contact' },
];

export const useCompanyDetails = (): CompanyDetails | null => {
  const [details, setDetails] = useState<CompanyDetails | null>(null);

  useEffect(() => {
    api
      .get('/legal/company')
      .then((res) => setDetails(res.data))
      .catch(() => undefined);
  }, []);

  return details;
};
