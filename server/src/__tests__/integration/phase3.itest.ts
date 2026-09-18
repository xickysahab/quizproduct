import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import { createApp } from '../../app';
import prisma from '../../config/prisma';
import { invalidatePlanCache } from '../../utils/plans';
import { responseBatcher } from '../../utils/responseBatcher';
import { truncateAll, seedPlans, testDatabaseUrl } from './setup';

/** Phase 3 — homework mode — through the real stack. */

const app = createApp();
let db: Client;

let ipCounter = 10;
const nextIp = (): string => `203.0.117.${(ipCounter += 1) % 250}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();

const hostWithQuiz = async () => {
  const email = `host${ipCounter}@example.com`;
  await request(app)
    .post('/auth/signup')
    .set('X-Forwarded-For', nextIp())
    .send({ name: 'Host', email, password: 'IntegrationTest#2026', organizationName: 'A Coaching Class' });
  const login = await request(app).post('/auth/login').set('X-Forwarded-For', nextIp()).send({ email, password: 'IntegrationTest#2026' });
  const token = login.body.token as string;
  const event = (await request(app).post('/events').set(auth(token)).send({ title: 'Chapter 3 homework' })).body.event;
  const ids: string[] = [];
  for (const [text, correctOption] of [['One', 0], ['Two', 1], ['Three', 2]] as const) {
    const q = await request(app).post('/questions').set(auth(token)).send({ eventId: event.id, text, options: ['a', 'b', 'c'], correctOption });
    ids.push(q.body.question.id);
  }
  return { token, eventId: event.id as string, roomCode: event.roomCode as string, ids };
};

const joinAs = async (roomCode: string, name: string) => {
  const res = await request(app).post('/participants/join').set('X-Forwarded-For', nextIp()).send({ roomCode, name });
  return res;
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
  await responseBatcher.shutdown();
  await db?.end();
  await prisma.$disconnect();
});

describe('homework mode', () => {
  it('lets a student work through questions in any order, once each, with no host', async () => {
    const { token, eventId, roomCode, ids } = await hostWithQuiz();
    await request(app).patch(`/events/${eventId}/homework`).set(auth(token)).send({ selfPaced: true, closesAt: tomorrow() }).expect(200);

    const joined = await joinAs(roomCode, 'Rahul');
    expect(joined.status).toBe(201);
    expect(joined.body.event.selfPaced).toBe(true);
    const student = { 'X-Participant-Token': joined.body.participantToken };

    const sheet = await request(app).get('/participants/homework').set(student).expect(200);
    expect(sheet.body.questions.map((q: { text: string }) => q.text)).toEqual(['One', 'Two', 'Three']);
    expect(sheet.body.questions[0]).not.toHaveProperty('correctOption');

    await request(app).post('/participants/response').set(student).send({ questionId: ids[2], selectedOption: 2 }).expect(200);
    await request(app).post('/participants/response').set(student).send({ questionId: ids[0], selectedOption: 1 }).expect(200);
    await request(app).post('/participants/response').set(student).send({ questionId: ids[0], selectedOption: 0 }).expect(409);

    const after = await request(app).get('/participants/homework').set(student).expect(200);
    expect(after.body.answered.sort()).toEqual([ids[0], ids[2]].sort());

    const report = await request(app)
      .get(`/analytics/events/${eventId}/participants/${joined.body.participant.id}`)
      .set(auth(token))
      .expect(200);
    expect(report.body.questions.map((q: { answer: { isCorrect: boolean } | null }) => q.answer?.isCorrect ?? null)).toEqual([
      false,
      null,
      true,
    ]);
  });

  it('closes when the window does', async () => {
    const { token, eventId, roomCode, ids } = await hostWithQuiz();
    await request(app).patch(`/events/${eventId}/homework`).set(auth(token)).send({ selfPaced: true, closesAt: tomorrow() }).expect(200);
    const joined = await joinAs(roomCode, 'Late');

    await prisma.event.update({ where: { id: eventId }, data: { closesAt: new Date(Date.now() - 60_000) } });

    expect((await joinAs(roomCode, 'Later')).status).toBe(403);
    await request(app)
      .post('/participants/response')
      .set('X-Participant-Token', joined.body.participantToken)
      .send({ questionId: ids[0], selectedOption: 0 })
      .expect(400);
  });

  it('refuses a window that closes before it opens, and one already past', async () => {
    const { token, eventId } = await hostWithQuiz();
    const past = new Date(Date.now() - 3600 * 1000).toISOString();
    await request(app).patch(`/events/${eventId}/homework`).set(auth(token)).send({ selfPaced: true, closesAt: past }).expect(400);
    await request(app)
      .patch(`/events/${eventId}/homework`)
      .set(auth(token))
      .send({ selfPaced: true, opensAt: tomorrow(), closesAt: new Date(Date.now() + 3600 * 1000).toISOString() })
      .expect(400);
  });

  it('leaves a live session answering only the current question', async () => {
    const { roomCode, ids } = await hostWithQuiz();
    const joined = await joinAs(roomCode, 'Live');
    await request(app)
      .post('/participants/response')
      .set('X-Participant-Token', joined.body.participantToken)
      .send({ questionId: ids[1], selectedOption: 1 })
      .expect(400);
  });
});
