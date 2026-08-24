import { PlanName } from './plans';

/**
 * The subscription lifecycle, kept in one place.
 *
 * The rule this file exists to enforce: `organization.plan` is what the
 * customer *bought*, never what they may *do*. Those two agree only while the
 * period is unexpired. Reading `plan` directly to decide a limit — which is
 * what every call site used to do — gives a workspace its paid quota forever
 * on the strength of a single payment.
 *
 * `resolvePlanState` is pure so the rules can be tested without a database,
 * and so every caller reaches the same verdict from the same three columns.
 */

export type SubscriptionStatus = 'NONE' | 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'MANUAL';

/**
 * Days of full access after the period ends.
 *
 * Not generosity. A renewal can fail for reasons that have nothing to do with
 * the customer — a bank's UPI mandate window, a card reissue, a finance team
 * that pays on Mondays — and the moment we cut access is the moment a host is
 * standing in front of a room that cannot join. Losing three days of revenue
 * is cheaper than losing the account.
 */
export const GRACE_PERIOD_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionRow {
  plan: PlanName;
  planStatus: SubscriptionStatus;
  planExpiresAt: Date | null;
}

export interface PlanState {
  /** What the workspace may actually do right now. Enforce against this. */
  effectivePlan: PlanName;
  /** What is on the row. Show this in billing UI, never enforce against it. */
  billedPlan: PlanName;
  /** The status as it should be right now, which may be ahead of the stored one. */
  status: SubscriptionStatus;
  expiresAt: Date | null;
  /** When access actually stops. Null when nothing expires. */
  accessEndsAt: Date | null;
  /** Whole days until access stops. Negative once it has. Null when it never does. */
  daysRemaining: number | null;
  /** Past due but still working. The only window where a nag banner is honest. */
  inGrace: boolean;
  /** Access has fallen back to the free tier. */
  lapsed: boolean;
}

/**
 * Adds calendar months, clamping to the end of the target month.
 *
 * Naive date arithmetic turns 31 January into 3 March. Billing a customer for
 * a month they were never sold is the kind of bug that ends up on Twitter.
 */
export const addMonths = (from: Date, months: number): Date => {
  const result = new Date(from.getTime());
  const targetDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const daysInTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(targetDay, daysInTargetMonth));
  return result;
};

/**
 * When the next paid period should end.
 *
 * Renewing early extends from the existing expiry rather than from today, so
 * a customer who pays a week ahead is not silently donating that week.
 */
export const nextPeriodEnd = (
  currentExpiry: Date | null,
  now: Date,
  months = 1
): Date => {
  const startFrom =
    currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  return addMonths(startFrom, months);
};

/** Whole days from `now` to `target`, rounded up so a partial day still counts. */
const daysBetween = (now: Date, target: Date): number =>
  Math.ceil((target.getTime() - now.getTime()) / DAY_MS);

export const resolvePlanState = (row: SubscriptionRow, now = new Date()): PlanState => {
  const billedPlan = row.plan || 'FREE';

  const free = (status: SubscriptionStatus): PlanState => ({
    effectivePlan: 'FREE',
    billedPlan,
    status,
    expiresAt: row.planExpiresAt,
    accessEndsAt: null,
    daysRemaining: null,
    inGrace: false,
    lapsed: status === 'EXPIRED',
  });

  // Nothing to expire. The free tier has no period, so it cannot lapse.
  if (billedPlan === 'FREE') return free('NONE');

  // Granted rather than bought — an enterprise contract billed offline, or a
  // comped account. There is no period to run out.
  if (row.planStatus === 'MANUAL' || !row.planExpiresAt) {
    return {
      effectivePlan: billedPlan,
      billedPlan,
      status: 'MANUAL',
      expiresAt: row.planExpiresAt,
      accessEndsAt: null,
      daysRemaining: null,
      inGrace: false,
      lapsed: false,
    };
  }

  const expiresAt = row.planExpiresAt;
  const accessEndsAt = new Date(expiresAt.getTime() + GRACE_PERIOD_DAYS * DAY_MS);

  if (now.getTime() < expiresAt.getTime()) {
    return {
      effectivePlan: billedPlan,
      billedPlan,
      status: 'ACTIVE',
      expiresAt,
      accessEndsAt,
      daysRemaining: daysBetween(now, expiresAt),
      inGrace: false,
      lapsed: false,
    };
  }

  if (now.getTime() < accessEndsAt.getTime()) {
    return {
      effectivePlan: billedPlan,
      billedPlan,
      status: 'GRACE',
      expiresAt,
      accessEndsAt,
      daysRemaining: daysBetween(now, accessEndsAt),
      inGrace: true,
      lapsed: false,
    };
  }

  return {
    effectivePlan: 'FREE',
    billedPlan,
    status: 'EXPIRED',
    expiresAt,
    accessEndsAt,
    daysRemaining: daysBetween(now, accessEndsAt),
    inGrace: false,
    lapsed: true,
  };
};

/** Convenience for the many call sites that only need the enforceable plan. */
export const effectivePlanOf = (row: SubscriptionRow | null | undefined): PlanName =>
  row ? resolvePlanState(row).effectivePlan : 'FREE';
