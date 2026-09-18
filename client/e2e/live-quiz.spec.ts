import { expect, test } from '@playwright/test';

/**
 * The product's core loop, end to end: a host builds a quiz and presents it,
 * a participant joins from a phone and answers, and both see the result.
 */

const API = process.env.E2E_API_URL || 'http://localhost:5001';

test('a host runs a quiz and a participant answers it', async ({ browser, request }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'EndToEnd#2026';
  await request.post(`${API}/auth/signup`, {
    data: { name: 'E2E Host', email, password, organizationName: 'E2E School' },
  });
  const login = await (await request.post(`${API}/auth/login`, { data: { email, password } })).json();

  // ---- Host: build the quiz ----------------------------------------------
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await hostContext.addInitScript(
    ([token, user]) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', user);
    },
    [login.token, JSON.stringify(login.user)]
  );
  const host = await hostContext.newPage();
  await host.goto('/dashboard');

  await host.getByRole('button', { name: 'New quiz' }).first().click();
  await host.getByPlaceholder('Chapter 3 — Motion').fill('Geography check');
  await host.getByRole('button', { name: 'Create quiz' }).click();
  await expect(host.getByRole('heading', { name: 'Geography check' })).toBeVisible();

  await host.getByRole('button', { name: 'Add question' }).click();
  await host.getByPlaceholder('E.g., What is the capital of France?').fill('Capital of India?');
  for (const [i, text] of ['New Delhi', 'Mumbai', 'Kolkata', 'Chennai'].entries()) {
    await host.getByPlaceholder(`Option ${i + 1}`).fill(text);
  }
  await host.getByRole('button', { name: 'Mark option 1 as correct' }).click();
  await host.getByRole('button', { name: 'Save' }).click();
  await expect(host.getByText('Capital of India?')).toBeVisible();

  const code = (await host.locator('button[title="Copy room code"] .font-mono').innerText()).trim();

  // ---- Participant: join from a phone ------------------------------------
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const phone = await phoneContext.newPage();
  await phone.goto(`/?code=${code}`);
  await phone.getByPlaceholder('Enter your name').fill('Riya');
  await phone.locator('button[type=submit]').click();
  await expect(phone.getByText("You're in, Riya!")).toBeVisible();

  // ---- Host presents; participant answers ---------------------------------
  await host.getByRole('button', { name: 'Present' }).click();
  await host.getByRole('button', { name: /^Start/ }).click();

  // A quiz runs as a game: the question is on the big screen and the phone
  // shows only the answers, so the room looks up.
  await expect(phone.getByText('Look up')).toBeVisible();
  await phone.getByRole('button', { name: /New Delhi/ }).click();
  await expect(phone.getByText('Correct!')).toBeVisible();

  // The host's count follows the room.
  await expect(host.getByText(/1\s*\/\s*1/)).toBeVisible();

  await hostContext.close();
  await phoneContext.close();
});
