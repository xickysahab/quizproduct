import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/prisma', () => ({ default: {} }));
vi.mock('../config/redis', () => ({ getQueueRedis: () => null }));

import { responseBatcher } from '../utils/responseBatcher';

describe('answer claims', () => {
  it('lets exactly one of four simultaneous claims win', async () => {
    const wins = await Promise.all([1, 2, 3, 4].map(() => responseBatcher.claim('q-1', 'p-1')));
    expect(wins.filter(Boolean)).toHaveLength(1);
  });

  it('is per question and per participant', async () => {
    expect(await responseBatcher.claim('q-2', 'p-1')).toBe(true);
    expect(await responseBatcher.claim('q-2', 'p-2')).toBe(true);
  });

  it('can be handed back when nothing was recorded', async () => {
    expect(await responseBatcher.claim('q-3', 'p-1')).toBe(true);
    await responseBatcher.release('q-3', 'p-1');
    expect(await responseBatcher.claim('q-3', 'p-1')).toBe(true);
  });
});
