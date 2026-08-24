/**
 * Consent purposes, itemised.
 *
 * DPDP Act 2023 §6 requires consent to be free, specific, informed and
 * unambiguous, with each purpose consented to separately. One bundled
 * "I agree to everything" checkbox does not satisfy it, so each purpose here is
 * a separate decision with its own plain-language description.
 *
 * Bump POLICY_VERSION whenever this list or its wording changes — stored
 * consent records reference the version they were given under, which is what
 * makes them evidence.
 */

export const POLICY_VERSION = '2026-08-01';

export interface ConsentPurpose {
  key: string;
  title: string;
  description: string;
  /** Required to use the product at all; cannot be declined while holding an account. */
  essential: boolean;
}

export const CONSENT_PURPOSES: ConsentPurpose[] = [
  {
    key: 'account',
    title: 'Run your account',
    description:
      'Store your name, email and password so you can sign in, and keep the sessions you create.',
    essential: true,
  },
  {
    key: 'session_data',
    title: 'Store session results',
    description:
      'Keep participant names, answers and questions from your sessions so you can see results afterwards.',
    essential: true,
  },
  {
    key: 'product_email',
    title: 'Product updates by email',
    description: 'Occasional email about new features and changes. Never shared with anyone else.',
    essential: false,
  },
  {
    key: 'analytics',
    title: 'Usage analytics',
    description:
      'Anonymous statistics about which features get used, to decide what to build next.',
    essential: false,
  },
];

const KEYS = new Set(CONSENT_PURPOSES.map((purpose) => purpose.key));

export const isKnownPurpose = (value: string): boolean => KEYS.has(value);

/**
 * Retention windows in days. DPDP §8(7) requires personal data to be erased
 * once the purpose it was collected for is served.
 */
export const RETENTION_DAYS = {
  /** Participant names and answers, after the session ends. */
  sessionData: 365,
  /** Activity log entries. */
  activityLogs: 730,
  /** Consumed or expired verification and reset tokens. */
  tokens: 30,
} as const;
