import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import { createApp } from '../../app';
import prisma from '../../config/prisma';
import { truncateAll, testDatabaseUrl } from './setup';

/**
 * Billing and plan enforcement, driven over HTTP.
 *
 * These exercise the parts that the unit suite structurally cannot: whether a
 * guard is actually wired to the route it is supposed to guard, whether a role
 * check is on the endpoint it protects, and whether an expired subscription
 * really does change what the API allows — as opposed to a pure function
 * returning the right verdict to nobody.
 */

const app = createApp();
let db: Client;

const signUp = async (email: string, organizationName: string) => {
  await request(app)
    .post('/auth/signup')
    .send({ name: 'Test Host', email, password: 'IntegrationTest#2026', organizationName });

  const login = await request(app)
    .post('/auth/login')
    .send({ email, password: 'IntegrationTest#2026' });

  return {
    token: login.body.token as string,
    userId: login.body.user.id as string,
    organizationId: login.body.user.organizationId as string,
  };
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  if (!db) {
    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
  }
  await truncateAll(db);
});

afterAll(async () => {
  await db?.end();
  await prisma.$disconnect();
});

describe('who may reach the billing endpoints', () => {
  it('refuses an unauthenticated caller', async () => {
    await request(app).get('/billing/subscription').expect(401);
    await request(app).get('/billing/invoices').expect(401);
    await request(app).post('/billing/checkout').send({ plan: 'PRO' }).expect(401);
  });

  it('serves plans and states without a login, because the pricing page needs them', async () => {
    await request(app).get('/billing/plans').expect(200);
    await request(app).get('/billing/states').expect(200);
    await request(app).get('/legal/company').expect(200);
  });

  it('does not let a staff member start a subscription', async () => {
    const tenant = await signUp('tenant-rbac@example.com', 'RBAC College');

    // A staff account inside the same workspace: same organisation, lesser role.
    const staff = await prisma.user.create({
      data: {
        name: 'Staff Member',
        email: 'staff-rbac@example.com',
        // bcrypt hash of IntegrationTest#2026, so the login route can be used.
        password: (await prisma.user.findUnique({
          where: { id: tenant.userId },
          select: { password: true },
        }))!.password,
        role: 'STAFF',
        organizationId: tenant.organizationId,
        parentUserId: tenant.userId,
      },
    });

    const login = await request(app)
      .post('/auth/login')
      .send({ email: staff.email, password: 'IntegrationTest#2026' });

    const response = await request(app)
      .post('/billing/checkout')
      .set(auth(login.body.token))
      .send({ plan: 'PRO' });

    expect(response.status).toBe(403);
  });
});

describe('one workspace cannot read another workspace', () => {
  it('hides an invoice belonging to somebody else', async () => {
    const mine = await signUp('mine@example.com', 'My College');
    const theirs = await signUp('theirs@example.com', 'Their College');

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: mine.organizationId,
        invoiceNumber: 'QP/2026-27/09001',
        subtotalPaise: 149_900,
        totalPaise: 176_882,
        cgstPaise: 13_491,
        sgstPaise: 13_491,
      },
    });

    await request(app).get(`/billing/invoices/${invoice.id}`).set(auth(mine.token)).expect(200);

    // 404 rather than 403, so the response does not confirm the id exists.
    await request(app).get(`/billing/invoices/${invoice.id}`).set(auth(theirs.token)).expect(404);
  });

  it('lists only the invoices belonging to the caller', async () => {
    const mine = await signUp('list-mine@example.com', 'Mine');
    const theirs = await signUp('list-theirs@example.com', 'Theirs');

    await prisma.invoice.createMany({
      data: [
        {
          organizationId: mine.organizationId,
          invoiceNumber: 'QP/2026-27/09002',
          subtotalPaise: 1,
          totalPaise: 1,
        },
        {
          organizationId: theirs.organizationId,
          invoiceNumber: 'QP/2026-27/09003',
          subtotalPaise: 1,
          totalPaise: 1,
        },
      ],
    });

    const response = await request(app).get('/billing/invoices').set(auth(mine.token)).expect(200);

    expect(response.body.invoices).toHaveLength(1);
    expect(response.body.invoices[0].invoiceNumber).toBe('QP/2026-27/09002');
  });
});

describe('the tax details a document depends on', () => {
  it('lets a GSTIN decide the state, over a conflicting one in the same request', async () => {
    const tenant = await signUp('gstin@example.com', 'GSTIN College');

    const response = await request(app)
      .patch('/billing/tax-details')
      .set(auth(tenant.token))
      .send({ gstin: '29AAPFU0939F1ZV', stateCode: '27' })
      .expect(200);

    // The GSTIN is the registration the document is filed against, so its
    // state is the only one that can be right.
    expect(response.body.organization.stateCode).toBe('29');
    expect(response.body.organization.stateName).toBe('Karnataka');
  });

  it('rejects a state code that is not a real state', async () => {
    const tenant = await signUp('badstate@example.com', 'Bad State');

    await request(app)
      .patch('/billing/tax-details')
      .set(auth(tenant.token))
      .send({ stateCode: '39' })
      .expect(400);
  });

  it('clears Indian tax fields when the buyer moves outside India', async () => {
    const tenant = await signUp('export@example.com', 'Export College');

    await request(app)
      .patch('/billing/tax-details')
      .set(auth(tenant.token))
      .send({ gstin: '27AAPFU0939F1ZV' })
      .expect(200);

    const response = await request(app)
      .patch('/billing/tax-details')
      .set(auth(tenant.token))
      .send({ billingCountry: 'US' })
      .expect(200);

    expect(response.body.organization.gstin).toBeNull();
    expect(response.body.organization.stateCode).toBeNull();
  });
});

describe('what an expired subscription actually allows', () => {
  const createEvent = (token: string, title: string) =>
    request(app).post('/events').set(auth(token)).send({ title });

  it('holds a free workspace to the free limit', async () => {
    const tenant = await signUp('free-limit@example.com', 'Free College');

    for (let i = 1; i <= 5; i += 1) {
      await createEvent(tenant.token, `Session ${i}`).expect(201);
    }

    const refused = await createEvent(tenant.token, 'One too many');
    expect(refused.status).toBe(402);
    expect(refused.body.message).toContain('FREE');
  });

  it('gives a paid workspace the paid limit', async () => {
    const tenant = await signUp('paid-limit@example.com', 'Paid College');

    await prisma.organization.update({
      where: { id: tenant.organizationId },
      data: {
        plan: 'PRO',
        planStatus: 'ACTIVE',
        planExpiresAt: new Date(Date.now() + 20 * 86_400_000),
      },
    });

    for (let i = 1; i <= 6; i += 1) {
      await createEvent(tenant.token, `Session ${i}`).expect(201);
    }
  });

  it('keeps the paid limit during the grace window', async () => {
    const tenant = await signUp('grace-limit@example.com', 'Grace College');

    await prisma.organization.update({
      where: { id: tenant.organizationId },
      data: {
        plan: 'PRO',
        planStatus: 'ACTIVE',
        // Yesterday: past due, inside grace.
        planExpiresAt: new Date(Date.now() - 86_400_000),
      },
    });

    const state = await request(app)
      .get('/billing/subscription')
      .set(auth(tenant.token))
      .expect(200);

    expect(state.body.subscription.status).toBe('GRACE');
    expect(state.body.subscription.effectivePlan).toBe('PRO');

    // Cutting a host off mid-session is what the grace window exists to avoid.
    await createEvent(tenant.token, 'Session during grace').expect(201);
  });

  it('takes the paid limit away once grace has run out', async () => {
    const tenant = await signUp('expired-limit@example.com', 'Expired College');

    await prisma.organization.update({
      where: { id: tenant.organizationId },
      data: {
        plan: 'PRO',
        planStatus: 'ACTIVE',
        planExpiresAt: new Date(Date.now() - 10 * 86_400_000),
      },
    });

    const state = await request(app)
      .get('/billing/subscription')
      .set(auth(tenant.token))
      .expect(200);

    expect(state.body.subscription.status).toBe('EXPIRED');
    expect(state.body.subscription.effectivePlan).toBe('FREE');
    expect(state.body.subscription.billedPlan).toBe('PRO');

    // This is the regression that matters: the row still says PRO, and the
    // API must hold them to FREE anyway.
    for (let i = 1; i <= 5; i += 1) {
      await createEvent(tenant.token, `Session ${i}`).expect(201);
    }
    const refused = await createEvent(tenant.token, 'One too many');
    expect(refused.status).toBe(402);
  });

  it('never expires a plan an administrator granted by hand', async () => {
    const tenant = await signUp('manual-limit@example.com', 'Manual College');

    await prisma.organization.update({
      where: { id: tenant.organizationId },
      data: { plan: 'ENTERPRISE', planStatus: 'MANUAL', planExpiresAt: null },
    });

    const state = await request(app)
      .get('/billing/subscription')
      .set(auth(tenant.token))
      .expect(200);

    expect(state.body.subscription.status).toBe('MANUAL');
    expect(state.body.subscription.effectivePlan).toBe('ENTERPRISE');
  });
});

describe('checkout refuses to guess at tax', () => {
  it('stops an Indian buyer who has no place of supply on file', async () => {
    const tenant = await signUp('nostate@example.com', 'No State College');

    // The suite runs as a registered supplier (see env.ts), so GST applies and
    // the place of supply genuinely changes the tax. The guard must stop here
    // rather than let an uninvoiceable sale through.
    const response = await request(app)
      .post('/billing/checkout')
      .set(auth(tenant.token))
      .send({ plan: 'PRO' });

    expect(response.status).toBe(428);
    expect(response.body.code).toBe('BILLING_DETAILS_REQUIRED');
  });

  it('rejects a plan nobody can buy', async () => {
    const tenant = await signUp('freeplan@example.com', 'Free Plan College');

    await request(app)
      .post('/billing/checkout')
      .set(auth(tenant.token))
      .send({ plan: 'FREE' })
      .expect(400);
  });
});

describe('the supplier identity the documents are issued under', () => {
  it('reports a complete, registered supplier', async () => {
    const response = await request(app).get('/legal/company').expect(200);

    expect(response.body.complete).toBe(true);
    expect(response.body.entity.gstRegistered).toBe(true);
    expect(response.body.missing).toEqual([]);
  });

  it('prices with GST while the supplier is registered', async () => {
    const response = await request(app).get('/billing/plans').expect(200);

    expect(response.body.gstApplies).toBe(true);
    const pro = response.body.plans.find((plan: { id: string }) => plan.id === 'PRO');
    expect(pro.pricePaise).toBe(149_900);
    expect(pro.priceWithGstPaise).toBe(176_882);
  });
});
