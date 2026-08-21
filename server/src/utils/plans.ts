/** Plan limits. Missing Stripe does not block the app — SuperAdmin can still assign a plan. */
export type PlanName = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface PlanLimits {
  eventsPerMonth: number;
  participantsPerEvent: number;
  questionsPerEvent: number;
  branding: boolean;
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  FREE: { eventsPerMonth: 5, participantsPerEvent: 50, questionsPerEvent: 20, branding: false },
  PRO: { eventsPerMonth: 100, participantsPerEvent: 500, questionsPerEvent: 100, branding: true },
  ENTERPRISE: { eventsPerMonth: 10_000, participantsPerEvent: 5_000, questionsPerEvent: 500, branding: true },
};

export const currentPeriod = (date = new Date()): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

export const limitsFor = (plan?: PlanName | null): PlanLimits => PLAN_LIMITS[plan || 'FREE'];
