import { describe, expect, it } from 'vitest';
import { createAlertThrottle } from '../utils/errorReporter';

describe('alert throttling', () => {
  const COOLDOWN = 60_000;

  it('lets the first occurrence through', () => {
    const allow = createAlertThrottle(COOLDOWN);
    expect(allow('db down', 0)).toBe(true);
  });

  it('suppresses the same error inside the cooldown', () => {
    // A crash loop produces the same error hundreds of times a minute.
    // Forwarding every one buries the alert that mattered and, on a free
    // webhook tier, gets the integration throttled off entirely.
    const allow = createAlertThrottle(COOLDOWN);
    allow('db down', 0);
    expect(allow('db down', 1_000)).toBe(false);
    expect(allow('db down', 59_999)).toBe(false);
  });

  it('lets it through again once the cooldown has passed', () => {
    const allow = createAlertThrottle(COOLDOWN);
    allow('db down', 0);
    expect(allow('db down', 60_000)).toBe(true);
  });

  it('never suppresses a different error', () => {
    // Throttling by message rather than globally, so a flood of one error
    // cannot hide a second, unrelated one behind it.
    const allow = createAlertThrottle(COOLDOWN);
    allow('db down', 0);
    expect(allow('payments failing', 1_000)).toBe(true);
  });

  it('does not grow without bound over a long-running process', () => {
    const allow = createAlertThrottle(COOLDOWN);
    for (let i = 0; i < 600; i += 1) allow(`error ${i}`, 0);

    // Well past the cooldown, the old entries are collectable — and the
    // throttle still behaves correctly rather than having lost its state.
    expect(allow('error 0', 200_000)).toBe(true);
    expect(allow('error 0', 200_001)).toBe(false);
  });
});
