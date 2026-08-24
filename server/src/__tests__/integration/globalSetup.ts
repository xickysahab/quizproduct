import { createTestDatabase, dropTestDatabase } from './setup';

/**
 * Creates and migrates the suite's database once, and takes it away
 * afterwards. Leaving it behind would mean the next run inherits whatever
 * state a failing test stopped in.
 */
export default async function () {
  await createTestDatabase();

  return async () => {
    await dropTestDatabase();
  };
}
