import { defineConfig } from 'vitest/config';

/**
 * Integration tests, kept separate from the unit suite on purpose.
 *
 * `npm test` must stay fast and require nothing but Node — it runs on every
 * push and nobody waits for a database to answer a question about GST
 * arithmetic. These need Postgres, create their own database, and are worth
 * the seconds they cost because they cover the parts that only break when
 * wired together.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.itest.ts'],
    globalSetup: ['src/__tests__/integration/globalSetup.ts'],
    setupFiles: ['src/__tests__/integration/env.ts'],
    // One database, shared. Running files in parallel against it would have
    // them truncating each other's rows mid-test.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
