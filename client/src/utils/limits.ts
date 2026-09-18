/**
 * "Unlimited" sessions, as the plan catalogue expresses it.
 *
 * The SuperAdmin pricing form caps sessions a month at 1,000,000 — the same
 * ceiling the server validates against in pricingPlan.controller.ts — and that
 * ceiling is how a plan says "no cap". Printing the literal number reads as a
 * limit rather than the absence of one, so every place that shows it asks here.
 */
export const UNLIMITED_SESSIONS = 1_000_000;

export const isUnlimitedSessions = (perMonth: number): boolean => perMonth >= UNLIMITED_SESSIONS;
