import { describe, expect, it } from 'vitest';
import {
  addMonths,
  nextPeriodEnd,
  resolvePlanState,
  effectivePlanOf,
  GRACE_PERIOD_DAYS,
  SubscriptionRow,
} from '../utils/subscription';

const iso = (value: string) => new Date(value);
const row = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  plan: 'PRO',
  planStatus: 'ACTIVE',
  planExpiresAt: iso('2026-09-24T00:00:00Z'),
  ...over,
});

describe('addMonths', () => {
  it('advances by a calendar month', () => {
    expect(addMonths(iso('2026-01-15T10:00:00Z'), 1).toISOString()).toBe('2026-02-15T10:00:00.000Z');
  });

  it('clamps to the end of a shorter month instead of overflowing', () => {
    // The naive version rolls 31 Jan into 3 March and bills a month nobody sold.
    expect(addMonths(iso('2026-01-31T00:00:00Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });

  it('handles a leap February', () => {
    expect(addMonths(iso('2028-01-31T00:00:00Z'), 1).toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it('crosses a year boundary', () => {
    expect(addMonths(iso('2026-12-10T00:00:00Z'), 1).toISOString()).toBe('2027-01-10T00:00:00.000Z');
  });
});

describe('nextPeriodEnd', () => {
  const now = iso('2026-08-24T00:00:00Z');

  it('starts from today for a first purchase', () => {
    expect(nextPeriodEnd(null, now).toISOString()).toBe('2026-09-24T00:00:00.000Z');
  });

  it('extends from the existing expiry when renewing early', () => {
    // Paying a week early must not cost the customer that week.
    const expiry = iso('2026-08-31T00:00:00Z');
    expect(nextPeriodEnd(expiry, now).toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });

  it('starts from today when the old period already lapsed', () => {
    const expiry = iso('2026-07-01T00:00:00Z');
    expect(nextPeriodEnd(expiry, now).toISOString()).toBe('2026-09-24T00:00:00.000Z');
  });
});

describe('resolvePlanState', () => {
  it('reports the free tier as never expiring', () => {
    const state = resolvePlanState(row({ plan: 'FREE', planStatus: 'NONE', planExpiresAt: null }));
    expect(state.effectivePlan).toBe('FREE');
    expect(state.status).toBe('NONE');
    expect(state.lapsed).toBe(false);
  });

  it('keeps a paid plan inside its period', () => {
    const state = resolvePlanState(row(), iso('2026-09-01T00:00:00Z'));
    expect(state.effectivePlan).toBe('PRO');
    expect(state.status).toBe('ACTIVE');
    expect(state.daysRemaining).toBe(23);
  });

  it('keeps access during the grace window but marks it past due', () => {
    const state = resolvePlanState(row(), iso('2026-09-25T00:00:00Z'));
    expect(state.effectivePlan).toBe('PRO');
    expect(state.status).toBe('GRACE');
    expect(state.inGrace).toBe(true);
    expect(state.lapsed).toBe(false);
  });

  it('drops to the free tier once grace has run out', () => {
    const past = new Date(iso('2026-09-24T00:00:00Z').getTime() + (GRACE_PERIOD_DAYS + 1) * 86400000);
    const state = resolvePlanState(row(), past);
    expect(state.effectivePlan).toBe('FREE');
    expect(state.billedPlan).toBe('PRO');
    expect(state.status).toBe('EXPIRED');
    expect(state.lapsed).toBe(true);
  });

  it('never expires a plan a SuperAdmin granted by hand', () => {
    const state = resolvePlanState(
      row({ planStatus: 'MANUAL', planExpiresAt: null }),
      iso('2030-01-01T00:00:00Z')
    );
    expect(state.effectivePlan).toBe('PRO');
    expect(state.status).toBe('MANUAL');
    expect(state.lapsed).toBe(false);
  });

  it('treats a paid plan with no expiry on record as granted, not as free', () => {
    // Grandfathered rows from before the lifecycle existed. Silently
    // downgrading a paying customer is worse than letting them run on.
    const state = resolvePlanState(row({ planStatus: 'ACTIVE', planExpiresAt: null }));
    expect(state.effectivePlan).toBe('PRO');
  });

  it('expires ENTERPRISE the same way as PRO', () => {
    const state = resolvePlanState(
      row({ plan: 'ENTERPRISE' }),
      iso('2026-10-01T00:00:00Z')
    );
    expect(state.effectivePlan).toBe('FREE');
    expect(state.billedPlan).toBe('ENTERPRISE');
  });

  it('is exact at the expiry boundary', () => {
    const atExpiry = resolvePlanState(row(), iso('2026-09-24T00:00:00Z'));
    expect(atExpiry.status).toBe('GRACE');
    const justBefore = resolvePlanState(row(), iso('2026-09-23T23:59:59Z'));
    expect(justBefore.status).toBe('ACTIVE');
  });
});

describe('effectivePlanOf', () => {
  it('falls back to the free tier for a missing organisation', () => {
    expect(effectivePlanOf(null)).toBe('FREE');
  });

  it('returns the enforceable plan, not the billed one', () => {
    expect(effectivePlanOf(row({ planExpiresAt: iso('2020-01-01T00:00:00Z') }))).toBe('FREE');
  });
});
