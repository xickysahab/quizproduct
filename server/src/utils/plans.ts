import prisma from '../config/prisma';

/**
 * The plan catalogue.
 *
 * These were constants in this file. That made every price change a code
 * change, a review and a deploy, with no record of who changed it — and it made
 * a new tier a schema migration, because the plan was also a Postgres enum.
 * Pricing is a commercial decision, so it lives in the database and a
 * SuperAdmin edits it.
 *
 * Read on nearly every quota check, so it is cached. The cache is invalidated
 * explicitly whenever a plan is written, and also expires on its own so that a
 * second server process picks up a change without needing to be told.
 */

/** A plan's `code`. Free-form now that plans are rows rather than an enum. */
export type PlanCode = string;

/** Retained under the old name; a great deal of code refers to it. */
export type PlanName = PlanCode;

export interface PlanLimits {
  code: PlanCode;
  label: string;
  blurb: string;
  /** Monthly price in paise, exclusive of tax. */
  pricePaise: number;
  eventsPerMonth: number;
  participantsPerEvent: number;
  questionsPerEvent: number;
  branding: boolean;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
}

/**
 * What the free tier is if the table cannot be read.
 *
 * Not a duplicate catalogue — a floor. If the database is unreachable mid
 * session, a quota check should refuse generously rather than throw and take
 * the request down with it. Deliberately the most restrictive plan, so a
 * failure can never hand somebody a larger allowance than they paid for.
 */
const FALLBACK: PlanLimits = {
  code: 'FREE',
  label: 'Free',
  blurb: 'For trying it out in a classroom or a team meeting.',
  pricePaise: 0,
  eventsPerMonth: 5,
  participantsPerEvent: 50,
  questionsPerEvent: 20,
  branding: false,
  isActive: true,
  isDefault: true,
  sortOrder: 0,
};

const CACHE_TTL_MS = 60_000;

let cached: { byCode: Map<string, PlanLimits>; expiresAt: number } | null = null;

/** Call after any write to the catalogue so the next read is fresh. */
export const invalidatePlanCache = (): void => {
  cached = null;
};

const load = async (): Promise<Map<string, PlanLimits>> => {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.byCode;

  try {
    const rows = await prisma.pricingPlan.findMany({ orderBy: { sortOrder: 'asc' } });
    const byCode = new Map<string, PlanLimits>(rows.map((row) => [row.code, row as PlanLimits]));

    // An empty table would silently give everybody the fallback's limits, so
    // treat it as a read failure rather than as "there are no plans".
    if (byCode.size === 0) return new Map([[FALLBACK.code, FALLBACK]]);

    cached = { byCode, expiresAt: now + CACHE_TTL_MS };
    return byCode;
  } catch {
    return new Map([[FALLBACK.code, FALLBACK]]);
  }
};

/** Every plan, including withdrawn ones. For admin screens. */
export const allPlans = async (): Promise<PlanLimits[]> =>
  [...(await load()).values()].sort((a, b) => a.sortOrder - b.sortOrder);

/** Only what may be bought today. For the pricing page. */
export const offeredPlans = async (): Promise<PlanLimits[]> =>
  (await allPlans()).filter((plan) => plan.isActive);

export const planByCode = async (code: string | null | undefined): Promise<PlanLimits | null> =>
  code ? (await load()).get(code) ?? null : null;

/** The plan a new workspace starts on, and where a lapsed one lands. */
export const defaultPlan = async (): Promise<PlanLimits> => {
  const plans = await allPlans();
  return plans.find((plan) => plan.isDefault) ?? plans[0] ?? FALLBACK;
};

/**
 * The limits to hold a workspace to.
 *
 * An unknown code falls back to the default plan rather than throwing: a
 * workspace whose plan was withdrawn from the catalogue must keep working, and
 * a quota check is the wrong place to discover a data problem.
 */
export const limitsFor = async (code: string | null | undefined): Promise<PlanLimits> =>
  (await planByCode(code)) ?? (await defaultPlan());

export const currentPeriod = (date = new Date()): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
