import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end: the real client against the real API and database.
 *
 * Runs against servers already up — `npm run dev` for both locally, or the
 * e2e job in CI — rather than starting them, so the same test drives either.
 * Uses the system's Chrome (channel: 'chrome'), which GitHub's Ubuntu runners
 * ship, so no browser download.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
