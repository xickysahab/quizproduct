import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import prisma from '../../config/prisma';
import { RETENTION_DAYS } from '../../utils/consent';
import { sweepRetention } from '../../utils/retention';
import { truncateAll, seedPlans, testDatabaseUrl } from './setup';

/**
 * Erasure, against a real database.
 *
 * This is the one job in the codebase whose bugs destroy data rather than
 * refuse a request, so it is tested on both sides: that it removes what the
 * published policy says it removes, and — more importantly — that it leaves
 * everything else alone.
 */

let db: Client;

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const makeHostAndEvent = async (opts: { isLive?: boolean } = {}) => {
  const host = await prisma.user.create({
    data: { email: `host-${Math.random()}@example.com`, password: 'x', name: 'Host' },
  });
  const event = await prisma.event.create({
    data: {
      title: 'Retention probe',
      roomCode: String(Math.floor(1_000_000 + Math.random() * 8_999_999)),
      hostId: host.id,
      isLive: opts.isLive ?? false,
    },
  });
  return { host, event };
};

/** A participant whose row is backdated to `age` days old. */
const participantAged = async (eventId: string, age: number, name = 'Old Voter') => {
  const p = await prisma.participant.create({ data: { eventId, name, sessionKey: String(Math.random()) } });
  await prisma.participant.update({ where: { id: p.id }, data: { joinedAt: daysAgo(age) } });
  return p;
};

beforeEach(async () => {
  if (!db) {
    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
  }
  await truncateAll(db);
  await seedPlans(db);
});

afterAll(async () => {
  await db?.end();
  await prisma.$disconnect();
});

describe('what the sweep erases', () => {
  it('removes participants past the published session window', async () => {
    const { event } = await makeHostAndEvent();
    await participantAged(event.id, RETENTION_DAYS.sessionData + 10);

    const result = await sweepRetention();

    expect(result.participants).toBe(1);
    expect(await prisma.participant.count()).toBe(0);
  });

  it('takes their answers with them, so no orphaned response survives', async () => {
    const { event } = await makeHostAndEvent();
    const question = await prisma.question.create({
      data: { eventId: event.id, text: 'Which one?', options: ['A', 'B'], correctOption: 0, order: 1 },
    });
    const participant = await participantAged(event.id, RETENTION_DAYS.sessionData + 1);
    await prisma.response.create({
      data: { questionId: question.id, participantId: participant.id, selectedOption: 0, isCorrect: true },
    });

    await sweepRetention();

    expect(await prisma.response.count()).toBe(0);
  });

  it('removes activity logs past their own, longer window', async () => {
    const { host } = await makeHostAndEvent();
    const log = await prisma.activityLog.create({
      data: { userId: host.id, action: 'CREATE_EVENT', resource: 'Event' },
    });
    await prisma.activityLog.update({
      where: { id: log.id },
      data: { createdAt: daysAgo(RETENTION_DAYS.activityLogs + 1) },
    });

    const result = await sweepRetention();

    expect(result.activityLogs).toBe(1);
    expect(await prisma.activityLog.count()).toBe(0);
  });

  it('removes reset tokens that are already spent', async () => {
    const { host } = await makeHostAndEvent();
    const token = await prisma.passwordResetToken.create({
      data: { userId: host.id, tokenHash: `spent-${Math.random()}`, expiresAt: daysAgo(1), usedAt: daysAgo(1) },
    });
    await prisma.passwordResetToken.update({
      where: { id: token.id },
      data: { createdAt: daysAgo(RETENTION_DAYS.tokens + 1) },
    });

    const result = await sweepRetention();

    expect(result.tokens).toBe(1);
  });
});

describe('what the sweep must not touch', () => {
  it('leaves a participant who is still inside the window', async () => {
    const { event } = await makeHostAndEvent();
    await participantAged(event.id, RETENTION_DAYS.sessionData - 5, 'Recent Voter');

    const result = await sweepRetention();

    expect(result.participants).toBe(0);
    expect(await prisma.participant.count()).toBe(1);
  });

  it('leaves the host their quiz — the event and its questions are not personal data', async () => {
    const { event } = await makeHostAndEvent();
    await prisma.question.create({
      data: { eventId: event.id, text: 'Kept', options: ['A'], correctOption: 0, order: 1 },
    });
    await participantAged(event.id, RETENTION_DAYS.sessionData + 30);

    await sweepRetention();

    expect(await prisma.event.count()).toBe(1);
    expect(await prisma.question.count()).toBe(1);
    expect(await prisma.participant.count()).toBe(0);
  });

  it('will not empty a room that is still live, however old it is', async () => {
    const { event } = await makeHostAndEvent({ isLive: true });
    await participantAged(event.id, RETENTION_DAYS.sessionData + 100);

    const result = await sweepRetention();

    expect(result.participants).toBe(0);
    expect(await prisma.participant.count()).toBe(1);
  });

  it('leaves a reset token that is old but still usable', async () => {
    const { host } = await makeHostAndEvent();
    const token = await prisma.passwordResetToken.create({
      data: {
        userId: host.id,
        tokenHash: `live-${Math.random()}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await prisma.passwordResetToken.update({
      where: { id: token.id },
      data: { createdAt: daysAgo(RETENTION_DAYS.tokens + 50) },
    });

    const result = await sweepRetention();

    expect(result.tokens).toBe(0);
    expect(await prisma.passwordResetToken.count()).toBe(1);
  });

  it('is safe to run twice — the second pass finds nothing left to do', async () => {
    const { event } = await makeHostAndEvent();
    await participantAged(event.id, RETENTION_DAYS.sessionData + 2);

    await sweepRetention();
    const second = await sweepRetention();

    expect(second).toEqual({ participants: 0, activityLogs: 0, tokens: 0 });
  });
});
