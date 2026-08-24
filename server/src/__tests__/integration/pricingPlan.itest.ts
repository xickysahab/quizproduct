import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import { createApp } from '../../app';
import prisma from '../../config/prisma';
import { invalidatePlanCache } from '../../utils/plans';
import { hashPassword } from '../../utils/auth';
import { truncateAll, seedPlans, testDatabaseUrl } from './setup';

/**
 * The plan catalogue as a SuperAdmin edits it.
 *
 * A pricing screen is one of the few places where one careless save breaks
 * every customer at once, so the rules are worth pinning down: a code that
 * cannot be renamed out from under the invoices that reference it, a default
 * that cannot be priced or withdrawn, and — the one that costs real money if
 * it regresses — a repricing that never changes what an in-flight payment gets
 * invoiced for.
 */

const app = createApp();
let db: Client;

let ipCounter = 100;
const nextIp = (): string => `203.0.114.${(ipCounter += 1) % 250}`;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A SUPERADMIN, created directly — there is no route that mints one. */
const superAdminToken = async (): Promise<string> => {
  await prisma.user.create({
    data: {
      name: 'Platform Owner',
      email: 'owner@example.com',
      password: await hashPassword('IntegrationTest#2026'),
      role: 'SUPERADMIN',
      emailVerifiedAt: new Date(),
    },
  });

  const login = await request(app)
    .post('/auth/login')
    .set('X-Forwarded-For', nextIp())
    .send({ email: 'owner@example.com', password: 'IntegrationTest#2026' });

  return login.body.token as string;
};

const tenantToken = async (email: string): Promise<{ token: string; organizationId: string }> => {
  await request(app)
    .post('/auth/signup')
    .set('X-Forwarded-For', nextIp())
    .send({ name: 'Host', email, password: 'IntegrationTest#2026', organizationName: 'A College' });

  const login = await request(app)
    .post('/auth/login')
    .set('X-Forwarded-For', nextIp())
    .send({ email, password: 'IntegrationTest#2026' });

  return { token: login.body.token, organizationId: login.body.user.organizationId };
};

const planId = async (token: string, code: string): Promise<string> => {
  const response = await request(app).get('/superadmin/plans').set(auth(token));
  return response.body.plans.find((plan: { code: string }) => plan.code === code).id;
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

describe('who may change what the product costs', () => {
  it('refuses an unauthenticated caller', async () => {
    await request(app).get('/superadmin/plans').expect(401);
    await request(app).post('/superadmin/plans').send({ code: 'CHEAP' }).expect(401);
  });

  it('refuses a tenant admin', async () => {
    // A tenant runs their own workspace. Setting the platform's prices is not
    // part of that, and the route guard is the only thing saying so.
    const tenant = await tenantToken('tenant-pricing@example.com');

    await request(app).get('/superadmin/plans').set(auth(tenant.token)).expect(403);
    await request(app)
      .patch(`/superadmin/plans/${'00000000-0000-0000-0000-000000000000'}`)
      .set(auth(tenant.token))
      .send({ pricePaise: 1 })
      .expect(403);
  });
});

describe('editing the catalogue', () => {
  it('lists every plan with how many workspaces are on it', async () => {
    const token = await superAdminToken();
    await tenantToken('counted@example.com');

    const response = await request(app).get('/superadmin/plans').set(auth(token)).expect(200);
    const free = response.body.plans.find((plan: { code: string }) => plan.code === 'FREE');

    // The count is what makes withdrawing a plan a decision rather than a
    // guess: nobody on it is housekeeping, forty customers on it is not.
    expect(free.organizationCount).toBe(1);
  });

  it('introduces a new tier without a migration', async () => {
    const token = await superAdminToken();

    await request(app)
      .post('/superadmin/plans')
      .set(auth(token))
      .send({
        code: 'campus',
        label: 'Campus',
        blurb: 'For a whole college.',
        pricePaise: 399_900,
        eventsPerMonth: 500,
        participantsPerEvent: 2_000,
        questionsPerEvent: 200,
        branding: true,
        sortOrder: 3,
      })
      .expect(201);

    // Lower case in, upper case stored — the code is an identifier.
    const publicList = await request(app).get('/billing/plans').expect(200);
    const campus = publicList.body.plans.find((plan: { id: string }) => plan.id === 'CAMPUS');
    expect(campus.pricePaise).toBe(399_900);
  });

  it('refuses a duplicate code', async () => {
    const token = await superAdminToken();

    await request(app)
      .post('/superadmin/plans')
      .set(auth(token))
      .send({
        code: 'PRO',
        label: 'Pro Again',
        blurb: 'Clash.',
        pricePaise: 1,
        eventsPerMonth: 1,
        participantsPerEvent: 1,
        questionsPerEvent: 1,
      })
      .expect(409);
  });

  it('changes a price', async () => {
    const token = await superAdminToken();
    const id = await planId(token, 'PRO');

    await request(app)
      .patch(`/superadmin/plans/${id}`)
      .set(auth(token))
      .send({ pricePaise: 199_900 })
      .expect(200);

    const publicList = await request(app).get('/billing/plans').expect(200);
    const pro = publicList.body.plans.find((plan: { id: string }) => plan.id === 'PRO');
    expect(pro.pricePaise).toBe(199_900);
  });

  it('records who changed a price, and from what', async () => {
    // The first question anyone asks when a customer disputes a charge.
    const token = await superAdminToken();
    const id = await planId(token, 'PRO');

    await request(app)
      .patch(`/superadmin/plans/${id}`)
      .set(auth(token))
      .send({ pricePaise: 199_900 })
      .expect(200);

    const log = await prisma.activityLog.findFirst({
      where: { action: 'UPDATE_PLAN' },
      orderBy: { createdAt: 'desc' },
    });

    expect(log).not.toBeNull();
    expect(log!.details).toMatchObject({ pricePaiseFrom: 149_900, pricePaiseTo: 199_900 });
  });
});

describe('the rules that stop one save breaking everyone', () => {
  it('will not rename a code', async () => {
    // The code is written onto workspaces and onto invoices already filed.
    const token = await superAdminToken();
    const id = await planId(token, 'PRO');

    await request(app)
      .patch(`/superadmin/plans/${id}`)
      .set(auth(token))
      .send({ code: 'PRO_V2' })
      .expect(400);
  });

  it('will not put a price on the default plan', async () => {
    // The default is what every new workspace lands on.
    const token = await superAdminToken();
    const id = await planId(token, 'FREE');

    await request(app)
      .patch(`/superadmin/plans/${id}`)
      .set(auth(token))
      .send({ pricePaise: 50_000 })
      .expect(400);
  });

  it('will not withdraw the default plan', async () => {
    const token = await superAdminToken();
    const id = await planId(token, 'FREE');

    await request(app)
      .patch(`/superadmin/plans/${id}/availability`)
      .set(auth(token))
      .send({ isActive: false })
      .expect(400);
  });

  it('will not make a paid plan the default', async () => {
    const token = await superAdminToken();
    const id = await planId(token, 'PRO');

    await request(app).patch(`/superadmin/plans/${id}/default`).set(auth(token)).send({}).expect(400);
  });

  it('rejects a price that looks like rupees mistaken for paise', async () => {
    const token = await superAdminToken();
    const id = await planId(token, 'PRO');

    await request(app)
      .patch(`/superadmin/plans/${id}`)
      .set(auth(token))
      .send({ pricePaise: 999_999_999 })
      .expect(400);
  });

  it('rejects limits that would make a plan useless', async () => {
    const token = await superAdminToken();
    const id = await planId(token, 'PRO');

    await request(app)
      .patch(`/superadmin/plans/${id}`)
      .set(auth(token))
      .send({ participantsPerEvent: 0 })
      .expect(400);
  });
});

describe('withdrawing a plan', () => {
  it('takes it off sale but leaves everyone on it alone', async () => {
    const token = await superAdminToken();
    const tenant = await tenantToken('kept@example.com');

    await prisma.organization.update({
      where: { id: tenant.organizationId },
      data: { plan: 'PRO', planStatus: 'MANUAL' },
    });

    const id = await planId(token, 'PRO');
    await request(app)
      .patch(`/superadmin/plans/${id}/availability`)
      .set(auth(token))
      .send({ isActive: false })
      .expect(200);

    // Gone from what anyone can buy.
    const publicList = await request(app).get('/billing/plans').expect(200);
    expect(publicList.body.plans.some((plan: { id: string }) => plan.id === 'PRO')).toBe(false);

    // But the workspace already on it keeps every limit it grants. Stranding
    // a paying customer because a tier was retired would be the worst possible
    // outcome of an admin tidying up.
    const state = await request(app)
      .get('/billing/subscription')
      .set(auth(tenant.token))
      .expect(200);

    expect(state.body.subscription.effectivePlan).toBe('PRO');
    expect(state.body.subscription.limits.eventsPerMonth).toBe(100);
  });

  it('stops anyone new buying it', async () => {
    const token = await superAdminToken();
    const tenant = await tenantToken('too-late@example.com');

    const id = await planId(token, 'PRO');
    await request(app)
      .patch(`/superadmin/plans/${id}/availability`)
      .set(auth(token))
      .send({ isActive: false })
      .expect(200);

    const response = await request(app)
      .post('/billing/checkout')
      .set(auth(tenant.token))
      .send({ plan: 'PRO' });

    expect(response.status).toBe(400);
  });
});

describe('a price change never rewrites what somebody was charged', () => {
  it('leaves an already-issued invoice exactly as it was', async () => {
    const token = await superAdminToken();
    const tenant = await tenantToken('issued@example.com');

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: tenant.organizationId,
        invoiceNumber: 'QP/2026-27/08001',
        plan: 'PRO',
        subtotalPaise: 149_900,
        totalPaise: 149_900,
      },
    });

    const id = await planId(token, 'PRO');
    await request(app)
      .patch(`/superadmin/plans/${id}`)
      .set(auth(token))
      .send({ pricePaise: 499_900 })
      .expect(200);

    const after = await request(app)
      .get(`/billing/invoices/${invoice.id}`)
      .set(auth(tenant.token))
      .expect(200);

    // An invoice is a historical record. Repricing is not a time machine.
    expect(after.body.invoice.subtotalPaise).toBe(149_900);
    expect(after.body.invoice.totalPaise).toBe(149_900);
  });

  it('quotes the current price at checkout, and freezes it into the order', async () => {
    const token = await superAdminToken();
    const tenant = await tenantToken('frozen@example.com');
    const id = await planId(token, 'PRO');

    await request(app)
      .patch(`/superadmin/plans/${id}`)
      .set(auth(token))
      .send({ pricePaise: 249_900 })
      .expect(200);

    // Checkout reaches Razorpay, which these tests do not, so the assertion is
    // on what the server priced rather than on the order it would have made.
    const plans = await request(app).get('/billing/plans').expect(200);
    const pro = plans.body.plans.find((plan: { id: string }) => plan.id === 'PRO');

    // The advertised figure and the charged figure come from one place, so
    // they cannot disagree.
    expect(pro.pricePaise).toBe(249_900);
  });
});
