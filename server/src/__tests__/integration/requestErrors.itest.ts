import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app';
import prisma from '../../config/prisma';

/**
 * A client sending broken or oversized JSON gets a 4xx it can act on, and the
 * team is not alerted: before this, both were a 500 through the crash reporter.
 */

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('unreadable request bodies', () => {
  it('answers malformed JSON with 400', async () => {
    const response = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "x",')
      .expect(400);
    expect(response.body.message).toBe('The request body is not valid JSON.');
  });

  it('answers a body over the 200 KB cap with 413', async () => {
    const response = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a'.repeat(300_000), password: 'x' }))
      .expect(413);
    expect(response.body.message).toBe('That request is too large.');
  });

  it('does not send either to the crash reporter', async () => {
    const spy = vi.spyOn(console, 'error');
    await request(app).post('/auth/login').set('Content-Type', 'application/json').send('{nope');
    await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'b'.repeat(300_000) }));
    const reported = spy.mock.calls.some((args) => String(args[0]).includes('request.unhandled_error'));
    spy.mockRestore();
    expect(reported).toBe(false);
  });
});
