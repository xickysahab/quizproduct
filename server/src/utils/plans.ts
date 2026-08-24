/** Plan limits. Missing Stripe does not block the app — SuperAdmin can still assign a plan. */
export type PlanName = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface PlanLimits {
  eventsPerMonth: number;
  participantsPerEvent: number;
  questionsPerEvent: number;
  branding: boolean;
  /** Monthly price in paise, exclusive of GST. Zero for the free tier. */
  pricePaise: number;
  label: string;
  /** What this tier is pitched at, shown on the pricing page. */
  blurb: string;
}

/**
 * Priced in INR, monthly, per workspace rather than per seat.
 *
 * Slido bills per user, annually, upfront — roughly $17.50/user/month for
 * business, capped at 200 participants. Indian colleges and mid-market teams
 * buy neither annually-upfront nor per-seat, so the shape is deliberately
 * different: one workspace price, monthly, with the participant cap as the
 * thing that scales.
 */
export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  FREE: {
    eventsPerMonth: 5,
    participantsPerEvent: 50,
    questionsPerEvent: 20,
    branding: false,
    pricePaise: 0,
    label: 'Free',
    blurb: 'For trying it out in a classroom or a team meeting.',
  },
  PRO: {
    eventsPerMonth: 100,
    participantsPerEvent: 500,
    questionsPerEvent: 100,
    branding: true,
    pricePaise: 149_900, // ₹1,499/month + GST
    label: 'Pro',
    blurb: 'For a department, a college, or a company running regular sessions.',
  },
  ENTERPRISE: {
    eventsPerMonth: 10_000,
    participantsPerEvent: 5_000,
    questionsPerEvent: 500,
    branding: true,
    pricePaise: 749_900, // ₹7,499/month + GST
    label: 'Enterprise',
    blurb: 'For conferences and campus-wide rollouts.',
  },
};

export const currentPeriod = (date = new Date()): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

export const limitsFor = (plan?: PlanName | null): PlanLimits => PLAN_LIMITS[plan || 'FREE'];
