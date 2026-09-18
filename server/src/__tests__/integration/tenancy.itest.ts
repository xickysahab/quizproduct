import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import { createApp } from '../../app';
import prisma from '../../config/prisma';
import { invalidatePlanCache } from '../../utils/plans';
import { truncateAll, seedPlans, testDatabaseUrl } from './setup';

/**
 * Two organisations that must never see each other.
 *
 * Every audit of this codebase so far has had one organisation in the data, so
 * tenancy isolation rested on reading getAccessibleHostIds and believing it.
 * Reading is not proof: the subtree logic can be perfectly correct and still be
 * wired to the wrong endpoint, or skipped on one route out of fifteen.
 *
 * So this builds two complete, unrelated workspaces — each with its own owner,
 * its own quiz, its own participants and its own invoice — and then tries, from
 * one, to reach every part of the other.
 */

const app = createApp();
let db: Client;

let ipCounter = 0;
const nextIp = (): string => `192.0.2.${(ipCounter += 1) % 250}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A whole workspace: an owner, a quiz with a question, and one participant. */
const makeWorkspace = async (slug: string) => {
  await request(app)
    .post('/auth/signup')
    .set('X-Forwarded-For', nextIp())
    .send({
      name: `${slug} owner`,
      email: `${slug}@example.com`,
      password: 'IntegrationTest#2026',
      organizationName: `${slug} Ltd`,
    });

  const login = await request(app)
    .post('/auth/login')
    .set('X-Forwarded-For', nextIp())
    .send({ email: `${slug}@example.com`, password: 'IntegrationTest#2026' });

  const token = login.body.token as string;
  const userId = login.body.user.id as string;
  const organizationId = login.body.user.organizationId as string;

  const created = await request(app)
    .post('/events')
    .set(auth(token))
    .send({ title: `${slug} quiz` })
    .expect(201);
  const event = created.body.event;

  const question = await request(app)
    .post('/questions')
    .set(auth(token))
    .send({
      eventId: event.id,
      type: 'MCQ',
      text: 'Whose room is this?',
      options: ['Mine', 'Theirs'],
      correctOption: 0,
      timeLimit: 60,
    })
    .expect(201);

  const join = await request(app)
    .post('/participants/join')
    .set('X-Forwarded-For', nextIp())
    .send({ roomCode: event.roomCode, name: `${slug} participant` })
    .expect(201);

  return {
    token,
    userId,
    organizationId,
    event,
    questionId: (question.body.question ?? question.body).id as string,
    participantToken: join.body.participantToken as string,
    participantId: join.body.participant.id as string,
  };
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

describe('one organisation cannot reach another', () => {
  it('does not list the other workspace’s quizzes', async () => {
    const acme = await makeWorkspace('acme');
    const rival = await makeWorkspace('rival');

    const listed = await request(app).get('/events?page=1&limit=60').set(auth(acme.token)).expect(200);
    const ids = (listed.body.events ?? listed.body).map((e: { id: string }) => e.id);

    expect(ids).toContain(acme.event.id);
    expect(ids).not.toContain(rival.event.id);
  });

  it('refuses every read of the other workspace’s quiz and its analytics', async () => {
    const acme = await makeWorkspace('acme');
    const rival = await makeWorkspace('rival');
    const forbidden = [403, 404];

    for (const path of [
      `/events/${rival.event.id}`,
      `/analytics/events/${rival.event.id}/summary`,
      `/analytics/events/${rival.event.id}/participants`,
      `/analytics/events/${rival.event.id}/leaderboard`,
      `/analytics/events/${rival.event.id}/export`,
      `/analytics/questions/${rival.questionId}`,
      `/analytics/events/${rival.event.id}/participants/${rival.participantId}`,
    ]) {
      const res = await request(app).get(path).set(auth(acme.token));
      expect(forbidden, `GET ${path} should be refused, got ${res.status}`).toContain(res.status);
    }
  });

  it('refuses every write to the other workspace’s quiz', async () => {
    const acme = await makeWorkspace('acme');
    const rival = await makeWorkspace('rival');
    const forbidden = [400, 403, 404];

    const attempts: [string, () => request.Test][] = [
      ['graft a question', () =>
        request(app).post('/questions').set(auth(acme.token)).send({
          eventId: rival.event.id, type: 'MCQ', text: 'grafted', options: ['x', 'y'], correctOption: 0,
        })],
      ['edit their question', () =>
        request(app).put(`/questions/${rival.questionId}`).set(auth(acme.token)).send({ text: 'HIJACKED' })],
      ['delete their question', () =>
        request(app).delete(`/questions/${rival.questionId}`).set(auth(acme.token))],
      ['change their room access', () =>
        request(app).patch(`/events/${rival.event.id}/access`).set(auth(acme.token)).send({ retireCode: true })],
      ['duplicate their quiz', () =>
        request(app).post(`/events/${rival.event.id}/duplicate`).set(auth(acme.token))],
      ['wipe their participants', () =>
        request(app).delete(`/events/${rival.event.id}/clear-data`).set(auth(acme.token))],
      ['delete their quiz', () =>
        request(app).delete(`/events/${rival.event.id}`).set(auth(acme.token))],
      ['reorder their questions', () =>
        request(app).put(`/questions/event/${rival.event.id}/reorder`).set(auth(acme.token)).send({ questionIds: [rival.questionId] })],
      ['import a sheet into their quiz', () =>
        request(app).post(`/questions/event/${rival.event.id}/import`).set(auth(acme.token)).send({
          rows: [{ type: 'MCQ', question: 'grafted', options: ['x', 'y'], correct: '1' }],
        })],
      ['draft into their quiz', () =>
        request(app).post(`/questions/event/${rival.event.id}/draft`).set(auth(acme.token)).send({
          pdfBase64: Buffer.from('%PDF-1.7').toString('base64'), language: 'en', count: 5, types: ['MCQ'],
        })],
      ['turn their quiz into homework', () =>
        request(app).patch(`/events/${rival.event.id}/homework`).set(auth(acme.token)).send({
          selfPaced: true, closesAt: new Date(Date.now() + 86_400_000).toISOString(),
        })],
      ['set their teams', () =>
        request(app).put(`/events/${rival.event.id}/teams`).set(auth(acme.token)).send({ names: ['A', 'B'] })],
    ];

    for (const [label, call] of attempts) {
      const res = await call();
      expect(forbidden, `${label} should be refused, got ${res.status}`).toContain(res.status);
    }

    // And nothing actually changed hands.
    expect(await prisma.event.findUnique({ where: { id: rival.event.id } })).not.toBeNull();
    expect(await prisma.question.count({ where: { eventId: rival.event.id } })).toBe(1);
    expect(await prisma.team.count({ where: { eventId: rival.event.id } })).toBe(0);
    expect((await prisma.event.findUnique({ where: { id: rival.event.id } }))?.selfPaced).toBe(false);
    const q = await prisma.question.findUnique({ where: { id: rival.questionId } });
    expect(q?.text).toBe('Whose room is this?');
    expect(await prisma.participant.count({ where: { eventId: rival.event.id } })).toBe(1);
  });

  it('scopes staff management to the caller’s own workspace', async () => {
    const acme = await makeWorkspace('acme');
    const rival = await makeWorkspace('rival');

    // A tenant owner manages staff through /tenant/staff; /users is a
    // SuperAdmin surface and is not theirs to reach at all.
    await request(app).get('/users').set(auth(acme.token)).expect(404);

    const staff = await request(app).get('/tenant/staff').set(auth(acme.token)).expect(200);
    const ids = (staff.body.staff ?? staff.body.users ?? staff.body ?? []).map((u: { id: string }) => u.id);
    expect(ids).not.toContain(rival.userId);
  });

  it('keeps billing separate: neither sees the other’s subscription or invoices', async () => {
    const acme = await makeWorkspace('acme');
    const rival = await makeWorkspace('rival');

    // Give the rival an invoice, so "sees nothing" is a real result rather than
    // both workspaces trivially having none.
    await prisma.invoice.create({
      data: {
        organizationId: rival.organizationId,
        invoiceNumber: 'RIVAL-0001',
        subtotalPaise: 100000,
        totalPaise: 100000,
      },
    });

    const invoices = await request(app).get('/billing/invoices').set(auth(acme.token)).expect(200);
    const rows = invoices.body.invoices ?? [];
    expect(rows.map((r: { invoiceNumber: string }) => r.invoiceNumber)).not.toContain('RIVAL-0001');

    const sub = await request(app).get('/billing/subscription').set(auth(acme.token)).expect(200);
    expect(sub.body.subscription.effectivePlan).toBe('FREE');
  });

  it('will not let a participant of one room answer a question in the other', async () => {
    const acme = await makeWorkspace('acme');
    const rival = await makeWorkspace('rival');

    // Make rival's question the live one, so the only thing that can refuse
    // this is the room check rather than "no question is active".
    await prisma.event.update({
      where: { id: rival.event.id },
      data: { isLive: true, currentQuestionId: rival.questionId, currentQuestionStartedAt: new Date() },
    });

    const res = await request(app)
      .post('/participants/response')
      .set('x-participant-token', acme.participantToken)
      .send({ questionId: rival.questionId, selectedOption: 0 });

    expect(res.status).toBe(403);
    expect(await prisma.response.count({ where: { questionId: rival.questionId } })).toBe(0);
  });

  it('scopes activity logs to the caller’s own workspace', async () => {
    const acme = await makeWorkspace('acme');
    const rival = await makeWorkspace('rival');

    // A tenant owner is not an admin, so the audit log is closed to them
    // outright — there is no filtered view of it to leak through.
    await request(app).get('/logs?page=1&limit=100').set(auth(acme.token)).expect(403);
    void rival;
  });
});
