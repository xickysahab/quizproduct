import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toParticipantQuestion } from '../utils/questionTypes';

/**
 * Regression cover for the Phase 1 live-session fixes. Both defects here were
 * invisible in normal use — one leaked data to the browser, the other showed up
 * only as unexplained write load — so they need tests that fail loudly.
 */

describe('participant question projection (BUG-01)', () => {
  const stored = {
    id: 'q1',
    eventId: 'e1',
    type: 'MCQ',
    text: 'Capital of Maharashtra?',
    options: ['Mumbai', 'Pune', 'Nagpur', 'Nashik'],
    correctOption: 0,
    correctOptions: [0],
    order: 1,
    timeLimit: 30,
  };

  it('never sends the answer key to participants', () => {
    const projected = toParticipantQuestion(stored) as Record<string, unknown>;

    expect(projected).not.toHaveProperty('correctOption');
    expect(projected).not.toHaveProperty('correctOptions');
    // Guards against a future field named like an answer key slipping through.
    expect(Object.keys(projected).filter((k) => k.toLowerCase().includes('correct'))).toEqual([]);
  });

  it('keeps everything the participant needs to render and answer', () => {
    expect(toParticipantQuestion(stored)).toEqual({
      id: 'q1',
      eventId: 'e1',
      type: 'MCQ',
      text: 'Capital of Maharashtra?',
      options: ['Mumbai', 'Pune', 'Nagpur', 'Nashik'],
      order: 1,
      timeLimit: 30,
    });
  });
});

// The batcher builds a Prisma client and starts a timer at import time, so both
// its dependencies are replaced before the module is loaded.
const executeRawUnsafe = vi.fn().mockResolvedValue(1);
let redisStub: {
  hkeys: ReturnType<typeof vi.fn>;
  hmget: ReturnType<typeof vi.fn>;
  hdel: ReturnType<typeof vi.fn>;
  hset: ReturnType<typeof vi.fn>;
} | null = null;

vi.mock('../config/prisma', () => ({
  default: { $executeRawUnsafe: (...args: unknown[]) => executeRawUnsafe(...args) },
}));

vi.mock('../config/redis', () => ({
  getQueueRedis: () => redisStub,
}));

const makeRedisStub = () => ({
  hkeys: vi.fn().mockResolvedValue([]),
  hmget: vi.fn().mockResolvedValue([]),
  hdel: vi.fn().mockResolvedValue(1),
  hset: vi.fn().mockResolvedValue(1),
});

const answer = (participantId: string) => ({
  questionId: 'q1',
  participantId,
  selectedOption: 1,
  selectedOptions: [],
  answerText: null,
  isCorrect: false,
  score: 0,
});

describe('response batcher queue draining (BUG-05)', () => {
  beforeEach(() => {
    executeRawUnsafe.mockClear();
    redisStub = null;
  });

  it('flushes locally queued answers exactly once when Redis is absent', async () => {
    const { responseBatcher } = await import('../utils/responseBatcher');

    await responseBatcher.addResponse(answer('p1'));
    expect(responseBatcher.pendingCount).toBe(1);

    await responseBatcher.shutdown();

    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(responseBatcher.pendingCount).toBe(0);
  });

  it('drains the local fallback queue when Redis is reachable but empty', async () => {
    vi.resetModules();
    const { responseBatcher } = await import('../utils/responseBatcher');

    // Buffer an answer while Redis is unavailable — it lands in the local queue.
    await responseBatcher.addResponse(answer('p2'));
    expect(responseBatcher.pendingCount).toBe(1);

    // Redis comes back, holding nothing. The entry must still be written, and
    // must not survive the flush: leaving it in place re-wrote the same row on
    // every 2s tick for the life of the process.
    redisStub = makeRedisStub();

    await responseBatcher.shutdown();

    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(responseBatcher.pendingCount).toBe(0);
  });

  it('does not re-flush on a subsequent tick once the queue is drained', async () => {
    vi.resetModules();
    const { responseBatcher } = await import('../utils/responseBatcher');

    await responseBatcher.addResponse(answer('p3'));
    redisStub = makeRedisStub();

    await responseBatcher.shutdown();
    const afterFirst = executeRawUnsafe.mock.calls.length;

    // A second drain has nothing left to write.
    await responseBatcher.shutdown();

    expect(executeRawUnsafe).toHaveBeenCalledTimes(afterFirst);
  });
});
