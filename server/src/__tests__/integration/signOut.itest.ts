import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import { createApp } from '../../app';
import prisma from '../../config/prisma';
import { truncateAll, seedPlans, testDatabaseUrl } from './setup';

const app = createApp();
let db: Client;

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

describe('signing out other devices', () => {
  it('voids every other copy of the login and keeps this device signed in', async () => {
    const creds = { email: 'teacher@example.com', password: 'IntegrationTest#2026' };
    await request(app).post('/auth/signup').set('X-Forwarded-For', '203.0.119.1')
      .send({ ...creds, name: 'Teacher', organizationName: 'School' });
    const login = () => request(app).post('/auth/login').set('X-Forwarded-For', '203.0.119.2').send(creds);
    const schoolPc = (await login()).body.token as string;
    const phone = (await login()).body.token as string;

    const res = await request(app).post('/auth/sign-out-others').set('Authorization', `Bearer ${phone}`).expect(200);

    await request(app).get('/auth/me').set('Authorization', `Bearer ${schoolPc}`).expect(401);
    await request(app).get('/auth/me').set('Authorization', `Bearer ${phone}`).expect(401);
    await request(app).get('/auth/me').set('Authorization', `Bearer ${res.body.token}`).expect(200);
  });
});
