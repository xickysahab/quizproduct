import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import { createApp } from '../../app';
import prisma from '../../config/prisma';
import { invalidatePlanCache } from '../../utils/plans';
import { endAbandonedSessions } from '../../utils/liveSessions';
import { truncateAll, seedPlans, testDatabaseUrl } from './setup';

/** Sessions a host walked away from stop being live; running ones are left alone. */

const app = createApp();
let db: Client;
let n = 0;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const liveSession = async (movedHoursAgo: number) => {
  n += 1;
  const email = `live${n}@example.com`;
  await request(app).post('/auth/signup').set('X-Forwarded-For', `203.0.118.${n}`)
    .send({ name: 'Host', email, password: 'IntegrationTest#2026', organizationName: 'School' });
  const login = await request(app).post('/auth/login').set('X-Forwarded-For', `203.0.118.${n}`)
    .send({ email, password: 'IntegrationTest#2026' });
  const event = (await request(app).post('/events').set(auth(login.body.token)).send({ title: 'Live' })).body.event;
  const q = await request(app).post('/questions').set(auth(login.body.token))
    .send({ eventId: event.id, text: 'Q', options: ['a', 'b'], correctOption: 0 });
  const questionId = q.body.question.id as string;
  await prisma.event.update({ where: { id: event.id }, data: { isLive: true, currentQuestionId: questionId } });
  // updatedAt is maintained by Prisma, so it is backdated underneath it.
  // In UTC, as Prisma reads a timestamp-without-zone column; a JS Date passed
  // straight through pg would land in the machine's local time.
  await db.query(
    `UPDATE "Event" SET "updatedAt" = (now() AT TIME ZONE 'UTC') - make_interval(hours => $2) WHERE id = $1`,
    [event.id, movedHoursAgo]
  );
  return { eventId: event.id as string, questionId, roomCode: event.roomCode as string };
};

beforeEach(async () => {
  if (!db) {
    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
  }
  await truncateAll(db);
  await seedPlans(db);
  invalidatePlanCache();
});

afterAll(async () => {
  await db?.end();
  await prisma.$disconnect();
});

describe('abandoned live sessions', () => {
  it('ends one nobody has touched for hours, and leaves a running one alone', async () => {
    const abandoned = await liveSession(8);
    const running = await liveSession(1);

    expect(await endAbandonedSessions()).toBe(1);

    const after = await prisma.event.findMany({ where: { id: { in: [abandoned.eventId, running.eventId] } } });
    expect(after.find((e) => e.id === abandoned.eventId)).toMatchObject({ isLive: false, currentQuestionId: null });
    expect(after.find((e) => e.id === running.eventId)).toMatchObject({ isLive: true });
  });

  it('keeps a session whose question moved long ago but is still being answered', async () => {
    const slow = await liveSession(8);
    const join = await request(app).post('/participants/join').set('X-Forwarded-For', '203.0.118.200')
      .send({ roomCode: slow.roomCode, name: 'Late' });
    await prisma.response.create({
      data: { questionId: slow.questionId, participantId: join.body.participant.id, selectedOption: 0, respondedAt: new Date() },
    });

    expect(await endAbandonedSessions()).toBe(0);
    expect((await prisma.event.findUnique({ where: { id: slow.eventId } }))?.isLive).toBe(true);
  });
});
