import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import { createApp } from '../../app';
import prisma from '../../config/prisma';
import { invalidatePlanCache } from '../../utils/plans';
import { truncateAll, seedPlans, testDatabaseUrl } from './setup';

/** Phase 2 — the per-student report — through the real stack. */

const app = createApp();
let db: Client;

let ipCounter = 10;
const nextIp = (): string => `203.0.116.${(ipCounter += 1) % 250}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const hostWithEvent = async (): Promise<{ token: string; eventId: string; roomCode: string }> => {
  const email = `host${ipCounter}@example.com`;
  await request(app)
    .post('/auth/signup')
    .set('X-Forwarded-For', nextIp())
    .send({ name: 'Host', email, password: 'IntegrationTest#2026', organizationName: 'A School' });
  const login = await request(app)
    .post('/auth/login')
    .set('X-Forwarded-For', nextIp())
    .send({ email, password: 'IntegrationTest#2026' });
  const token = login.body.token as string;
  const event = await request(app).post('/events').set(auth(token)).send({ title: 'Chapter 3' }).expect(201);
  return { token, eventId: event.body.event.id, roomCode: event.body.event.roomCode };
};

const join = async (roomCode: string, name: string): Promise<string> => {
  const res = await request(app).post('/participants/join').set('X-Forwarded-For', nextIp()).send({ roomCode, name });
  return res.body.participant.id as string;
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

describe('a report for each student', () => {
  it('shows every question, what they chose, what was right, and where they placed', async () => {
    const { token, eventId, roomCode } = await hostWithEvent();
    const add = (text: string, correctOption: number) =>
      request(app).post('/questions').set(auth(token)).send({ eventId, text, options: ['a', 'b', 'c'], correctOption });
    const q1 = (await add('First', 0)).body.question.id;
    const q2 = (await add('Second', 1)).body.question.id;
    await add('Third', 2);

    const rahul = await join(roomCode, 'Rahul');
    const priya = await join(roomCode, 'Priya');
    await prisma.response.createMany({
      data: [
        { questionId: q1, participantId: rahul, selectedOption: 0, isCorrect: true, score: 1 },
        { questionId: q2, participantId: rahul, selectedOption: 2, isCorrect: false, score: 0 },
        { questionId: q1, participantId: priya, selectedOption: 0, isCorrect: true, score: 1 },
        { questionId: q2, participantId: priya, selectedOption: 1, isCorrect: true, score: 1 },
      ],
    });

    const res = await request(app).get(`/analytics/events/${eventId}/participants/${rahul}`).set(auth(token)).expect(200);
    expect(res.body).toMatchObject({ participant: { name: 'Rahul' }, score: 1, rank: 2, totalParticipants: 2 });
    expect(res.body.questions.map((q: { text: string; correctOption: number; answer: { selectedOption: number; isCorrect: boolean } | null }) => [
      q.text,
      q.correctOption,
      q.answer && [q.answer.selectedOption, q.answer.isCorrect],
    ])).toEqual([
      ['First', 0, [0, true]],
      ['Second', 1, [2, false]],
      ['Third', 2, null],
    ]);
  });

  it('does not show one host another host’s student', async () => {
    const mine = await hostWithEvent();
    const theirs = await hostWithEvent();
    const student = await join(theirs.roomCode, 'Rahul');

    await request(app).get(`/analytics/events/${theirs.eventId}/participants/${student}`).set(auth(mine.token)).expect(403);
    // Nor through an event they do own.
    await request(app).get(`/analytics/events/${mine.eventId}/participants/${student}`).set(auth(mine.token)).expect(404);
  });
});
