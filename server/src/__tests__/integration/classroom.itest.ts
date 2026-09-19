import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import { createApp } from '../../app';
import prisma from '../../config/prisma';
import { invalidatePlanCache } from '../../utils/plans';
import { truncateAll, seedPlans, testDatabaseUrl } from './setup';

/**
 * Classes: a teacher makes one, students join with its code and stay until
 * removed. The rules worth pinning are the ones that leak data if they
 * regress — a student reaching host routes, or one organisation seeing
 * another's class.
 */

const app = createApp();
let db: Client;

let ipCounter = 10;
const nextIp = (): string => `198.51.100.${(ipCounter += 1) % 250}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const PASSWORD = 'IntegrationTest#2026';

const teacher = async (email: string): Promise<string> => {
  await request(app)
    .post('/auth/signup')
    .set('X-Forwarded-For', nextIp())
    .send({ name: 'Teacher', email, password: PASSWORD, organizationName: 'A School' });
  const login = await request(app)
    .post('/auth/login')
    .set('X-Forwarded-For', nextIp())
    .send({ email, password: PASSWORD });
  return login.body.token as string;
};

const student = async (email: string, name = 'Student'): Promise<{ token: string; id: string }> => {
  const response = await request(app)
    .post('/auth/student-signup')
    .set('X-Forwarded-For', nextIp())
    .send({ name, email, password: PASSWORD })
    .expect(201);
  return { token: response.body.token, id: response.body.user.id };
};

const createClass = async (token: string, name = 'Class 10 A') =>
  (await request(app).post('/classrooms').set(auth(token)).send({ name, section: 'Physics' }).expect(201)).body
    .classroom as { id: string; joinCode: string };

const join = (token: string, code: string) =>
  request(app).post('/student/classrooms/join').set(auth(token)).set('X-Forwarded-For', nextIp()).send({ code });

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

describe('student accounts', () => {
  it('signs a student straight in, attached to no organisation or class', async () => {
    const response = await request(app)
      .post('/auth/student-signup')
      .set('X-Forwarded-For', nextIp())
      .send({ name: 'Riya', email: 'Riya@Example.com', password: PASSWORD })
      .expect(201);

    expect(response.body.user).toMatchObject({ role: 'STUDENT', organizationId: null, email: 'riya@example.com' });

    const me = await request(app).get('/auth/me').set(auth(response.body.token)).expect(200);
    expect(me.body.user.organizationId).toBeNull();

    const mine = await request(app).get('/student/classrooms').set(auth(response.body.token)).expect(200);
    expect(mine.body.classrooms).toEqual([]);
  });

  it('says when the address is already taken', async () => {
    await student('taken@example.com');
    await request(app)
      .post('/auth/student-signup')
      .set('X-Forwarded-For', nextIp())
      .send({ name: 'Again', email: 'taken@example.com', password: PASSWORD })
      .expect(409);
  });

  it('keeps a student out of every host route', async () => {
    const { token } = await student('nosy@example.com');

    await request(app).get('/events').set(auth(token)).expect(403);
    await request(app).post('/events').set(auth(token)).send({ title: 'Mine now' }).expect(403);
    await request(app).get('/classrooms').set(auth(token)).expect(403);
    await request(app).post('/classrooms').set(auth(token)).send({ name: 'Fake' }).expect(403);
    await request(app).get('/billing/subscription').set(auth(token)).expect(403);
  });

  it('keeps a host out of the student routes', async () => {
    const token = await teacher('host@example.com');
    await request(app).get('/student/classrooms').set(auth(token)).expect(403);
  });
});

describe('joining a class', () => {
  it('joins with a code however it is typed, and only once', async () => {
    const teacherToken = await teacher('t1@example.com');
    const classroom = await createClass(teacherToken);
    expect(classroom.joinCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    const s = await student('s1@example.com');
    const messy = ` ${classroom.joinCode.toLowerCase().slice(0, 3)} ${classroom.joinCode.slice(3).toLowerCase()} `;

    const first = await join(s.token, messy).expect(201);
    expect(first.body).toMatchObject({ alreadyMember: false, classroom: { name: 'Class 10 A', teacherName: 'Teacher' } });

    const second = await join(s.token, classroom.joinCode).expect(200);
    expect(second.body.alreadyMember).toBe(true);

    const mine = await request(app).get('/student/classrooms').set(auth(s.token)).expect(200);
    expect(mine.body.classrooms).toHaveLength(1);

    const detail = await request(app).get(`/classrooms/${classroom.id}`).set(auth(teacherToken)).expect(200);
    expect(detail.body.students.map((x: { email: string }) => x.email)).toEqual(['s1@example.com']);
  });

  it('accepts a pasted join link', async () => {
    const classroom = await createClass(await teacher('t2@example.com'));
    const s = await student('s2@example.com');
    await join(s.token, `https://raisehand.app/join-class/${classroom.joinCode}`).expect(201);
  });

  it('refuses a code no class uses', async () => {
    const s = await student('s3@example.com');
    await join(s.token, 'ZZZZZZ').expect(404);
    await join(s.token, 'not a code').expect(404);
  });
});

describe('managing a class', () => {
  it('removes a student, who can rejoin until the code is reset', async () => {
    const teacherToken = await teacher('t3@example.com');
    const classroom = await createClass(teacherToken);
    const s = await student('s4@example.com');
    await join(s.token, classroom.joinCode).expect(201);

    await request(app).delete(`/classrooms/${classroom.id}/members/${s.id}`).set(auth(teacherToken)).expect(200);

    const afterRemove = await request(app).get('/student/classrooms').set(auth(s.token)).expect(200);
    expect(afterRemove.body.classrooms).toEqual([]);
    const detail = await request(app).get(`/classrooms/${classroom.id}`).set(auth(teacherToken)).expect(200);
    expect(detail.body.students).toEqual([]);

    // Rejoining with the same code works, as in Google Classroom…
    await join(s.token, classroom.joinCode).expect(201);

    // …until the teacher resets it. Members already in stay in.
    const reset = await request(app).post(`/classrooms/${classroom.id}/reset-code`).set(auth(teacherToken)).expect(200);
    expect(reset.body.joinCode).not.toBe(classroom.joinCode);

    const newcomer = await student('s5@example.com');
    await join(newcomer.token, classroom.joinCode).expect(404);
    await join(newcomer.token, reset.body.joinCode).expect(201);

    const final = await request(app).get(`/classrooms/${classroom.id}`).set(auth(teacherToken)).expect(200);
    expect(final.body.students).toHaveLength(2);
  });

  it('hides one organisation’s classes from another', async () => {
    const mine = await teacher('mine@example.com');
    const theirs = await teacher('theirs@example.com');
    const classroom = await createClass(mine);

    await request(app).get(`/classrooms/${classroom.id}`).set(auth(theirs)).expect(404);
    await request(app).post(`/classrooms/${classroom.id}/reset-code`).set(auth(theirs)).expect(404);
    await request(app).delete(`/classrooms/${classroom.id}`).set(auth(theirs)).expect(404);

    const list = await request(app).get('/classrooms').set(auth(theirs)).expect(200);
    expect(list.body.classrooms).toEqual([]);
  });

  it('lets a student erase their account while in a class', async () => {
    const classroom = await createClass(await teacher('t6@example.com'));
    const s = await student('s6@example.com');
    await join(s.token, classroom.joinCode).expect(201);

    await request(app).post('/privacy/delete-account').set(auth(s.token)).expect(200);
    expect(await prisma.user.findUnique({ where: { id: s.id } })).toBeNull();
  });

  it('lets a teacher who has classes erase their account', async () => {
    const teacherToken = await teacher('t7@example.com');
    const classroom = await createClass(teacherToken);
    await join((await student('s7@example.com')).token, classroom.joinCode).expect(201);

    await request(app).post('/privacy/delete-account').set(auth(teacherToken)).expect(200);
    expect(await prisma.classroom.findUnique({ where: { id: classroom.id } })).toBeNull();
  });
});
