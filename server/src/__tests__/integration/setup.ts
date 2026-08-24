import 'dotenv/config';
import { execSync } from 'child_process';
import { Client } from 'pg';

/**
 * A real database for the tests that need one.
 *
 * Everything in this project was unit-tested and nothing above that level was,
 * which left the riskiest code — auth, role checks, quota enforcement, the
 * billing endpoints — covered only by the parts of it that are pure functions.
 * These tests drive the actual Express stack over HTTP against a real Postgres,
 * because a role check that passes in isolation and is wired to the wrong route
 * still lets the wrong person in.
 *
 * The database is created, migrated and dropped by the suite, and is never the
 * developer's own — the name is derived and asserted before anything runs, so a
 * stray DATABASE_URL cannot get a working database truncated.
 */

const TEST_DB_NAME = 'quizpulse_integration';

const adminUrl = (): string => {
  const base = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!base) throw new Error('Set DATABASE_URL or TEST_DATABASE_URL to run integration tests.');
  const url = new URL(base);
  url.pathname = '/postgres';
  return url.toString();
};

export const testDatabaseUrl = (): string => {
  const base = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL!;
  const url = new URL(base);
  url.pathname = `/${TEST_DB_NAME}`;
  return url.toString();
};

/** Refuses to touch anything that is not the suite's own database. */
const assertIsTestDatabase = (url: string): void => {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (name !== TEST_DB_NAME) {
    throw new Error(`Refusing to operate on "${name}" — integration tests only use ${TEST_DB_NAME}.`);
  }
};

export const createTestDatabase = async (): Promise<string> => {
  const url = testDatabaseUrl();
  assertIsTestDatabase(url);

  const admin = new Client({ connectionString: adminUrl() });
  await admin.connect();
  try {
    // Dropped first so a suite that died halfway last time cannot leave
    // half-migrated state that makes today's failures someone else's.
    await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
  } finally {
    await admin.end();
  }

  // The real migrations, not `db push`. If a migration is broken, these tests
  // should be where that is discovered.
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });

  return url;
};

export const dropTestDatabase = async (): Promise<void> => {
  const url = testDatabaseUrl();
  assertIsTestDatabase(url);

  const admin = new Client({ connectionString: adminUrl() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
};

/**
 * Empties every table between tests.
 *
 * TRUNCATE ... CASCADE rather than deleting per model: it is one statement, it
 * does not care about foreign-key ordering, and it cannot be silently defeated
 * by a new model somebody forgot to add to a list.
 */
export const truncateAll = async (client: Client): Promise<void> => {
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  );

  if (rows.length === 0) return;

  const list = rows.map((row) => `"public"."${row.tablename}"`).join(', ');
  await client.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
};

/**
 * Re-seeds the plan catalogue after a truncate.
 *
 * The migration seeds these, but `truncateAll` empties every table between
 * tests — and an empty catalogue is not a state the application is ever
 * supposed to be in. Every test starts from the same three plans the product
 * actually ships with.
 */
export const seedPlans = async (client: Client): Promise<void> => {
  await client.query(`
    INSERT INTO "PricingPlan"
      ("id", "code", "label", "blurb", "pricePaise", "eventsPerMonth",
       "participantsPerEvent", "questionsPerEvent", "branding", "isDefault", "sortOrder", "updatedAt")
    VALUES
      (gen_random_uuid()::text, 'FREE', 'Free', 'For trying it out.',
       0, 5, 50, 20, false, true, 0, CURRENT_TIMESTAMP),
      (gen_random_uuid()::text, 'PRO', 'Pro', 'For a department or a college.',
       149900, 100, 500, 100, true, false, 1, CURRENT_TIMESTAMP),
      (gen_random_uuid()::text, 'ENTERPRISE', 'Enterprise', 'For campus-wide rollouts.',
       749900, 10000, 5000, 500, true, false, 2, CURRENT_TIMESTAMP)
    ON CONFLICT ("code") DO NOTHING
  `);
};
