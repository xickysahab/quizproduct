import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import { createApp } from '../../app';
import prisma from '../../config/prisma';
import { invalidatePlanCache } from '../../utils/plans';
import { truncateAll, seedPlans, testDatabaseUrl } from './setup';

/**
 * Phase 1 — images, the AI-draft allowance and question-bank import — through
 * the real stack: the route order in app.ts (per-route body parsers, limiter,
 * auth) is what these depend on, and none of it is visible to a unit test.
 */

const app = createApp();
let db: Client;

let ipCounter = 10;
const nextIp = (): string => `203.0.115.${(ipCounter += 1) % 250}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

const hostWithEvent = async (): Promise<{ token: string; eventId: string }> => {
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
  return { token, eventId: event.body.event.id };
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

describe('image uploads', () => {
  it('refuses a stranger', async () => {
    await request(app).post('/images').set('Content-Type', 'image/png').send(PNG).expect(401);
  });

  it('stores an image and serves it back, cacheable forever', async () => {
    const { token } = await hostWithEvent();
    const upload = await request(app).post('/images').set(auth(token)).set('Content-Type', 'image/png').send(PNG).expect(201);
    expect(upload.body.url).toMatch(/^\/images\/[0-9a-f-]{36}$/);

    const served = await request(app).get(upload.body.url).expect(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['cache-control']).toContain('immutable');
    expect(Buffer.compare(served.body as Buffer, PNG)).toBe(0);
  });

  it('refuses a file over the cap with a 413, not a 500', async () => {
    const { token } = await hostWithEvent();
    const big = Buffer.concat([PNG, Buffer.alloc(600 * 1024)]);
    const res = await request(app).post('/images').set(auth(token)).set('Content-Type', 'image/png').send(big).expect(413);
    expect(res.body.message).toMatch(/too large/);
  });

  it('refuses a file that only claims to be an image', async () => {
    const { token } = await hostWithEvent();
    await request(app)
      .post('/images')
      .set(auth(token))
      .set('Content-Type', 'image/png')
      .send(Buffer.from('<script>alert(1)</script>'))
      .expect(400);
  });

  it('attaches an uploaded image to a question and refuses a hotlinked one', async () => {
    const { token, eventId } = await hostWithEvent();
    const { body } = await request(app).post('/images').set(auth(token)).set('Content-Type', 'image/png').send(PNG);

    const base = { eventId, type: 'OPEN_TEXT', text: 'What is shown?' };
    const saved = await request(app).post('/questions').set(auth(token)).send({ ...base, imageUrl: body.url }).expect(201);
    expect(saved.body.question.imageUrl).toBe(body.url);

    await request(app)
      .post('/questions')
      .set(auth(token))
      .send({ ...base, imageUrl: 'https://tracker.example.com/pixel.png' })
      .expect(400);
  });
});

describe('AI draft allowance', () => {
  it('refuses a plan with no drafts before calling the model', async () => {
    const { token, eventId } = await hostWithEvent();
    const res = await request(app)
      .post(`/questions/event/${eventId}/draft`)
      .set(auth(token))
      .send({ pdfBase64: Buffer.from('%PDF-1.7 test').toString('base64'), language: 'hi', count: 10, types: ['MCQ'] })
      .expect(402);
    expect(res.body.message).toMatch(/does not include AI drafts/);
  });
});

describe('question bank import', () => {
  const row = (n: number) => ({ type: 'MCQ', question: `Question ${n}`, options: ['a', 'b', 'c', 'd'], correct: '2' });

  it('imports 100 rows in one step, in sheet order', async () => {
    const { token, eventId } = await hostWithEvent();
    await db.query(`UPDATE "PricingPlan" SET "questionsPerEvent" = 200`);
    invalidatePlanCache();

    const rows = Array.from({ length: 100 }, (_, i) => row(i + 1));
    await request(app).post(`/questions/event/${eventId}/import`).set(auth(token)).send({ rows }).expect(201);

    const saved = await prisma.question.findMany({ where: { eventId }, orderBy: { order: 'asc' } });
    expect(saved).toHaveLength(100);
    expect(saved[99]).toMatchObject({ text: 'Question 100', correctOption: 1, order: 100 });
  });

  it('names three bad rows and saves nothing', async () => {
    const { token, eventId } = await hostWithEvent();
    const rows = [row(1), { ...row(2), question: '' }, row(3), { ...row(4), correct: '7' }, { ...row(5), type: 'essay' }];

    const res = await request(app).post(`/questions/event/${eventId}/import`).set(auth(token)).send({ rows }).expect(400);
    expect(res.body.errors.map((e: { row: number }) => e.row)).toEqual([3, 5, 6]);
    expect(await prisma.question.count({ where: { eventId } })).toBe(0);
  });

  it('refuses a sheet that would go past the plan', async () => {
    const { token, eventId } = await hostWithEvent();
    const rows = Array.from({ length: 21 }, (_, i) => row(i + 1));
    await request(app).post(`/questions/event/${eventId}/import`).set(auth(token)).send({ rows }).expect(402);
    expect(await prisma.question.count({ where: { eventId } })).toBe(0);
  });
});
