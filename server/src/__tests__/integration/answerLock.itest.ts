import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import { createApp } from '../../app';
import prisma from '../../config/prisma';
import { invalidatePlanCache } from '../../utils/plans';
import { responseBatcher } from '../../utils/responseBatcher';
import { truncateAll, seedPlans, testDatabaseUrl } from './setup';
import { makeRevealer } from '../../socket';

/**
 * Whether an answer is final, driven over HTTP.
 *
 * The rule has two halves and they pull in opposite directions, which is why
 * this is worth an integration test rather than a unit one: a graded answer
 * must lock, because the response body tells the caller whether they were
 * right — so without a lock, someone who knows nothing submits each option in
 * turn until the server confirms one. A survey vote must NOT lock, because
 * nothing is revealed and changing your mind is the whole point of a poll.
 *
 * A regression in either direction is silent. Tightening the guard breaks every
 * poll in the product; loosening it hands out full marks.
 */

const app = createApp();
let db: Client;

let ipCounter = 0;
const nextIp = (): string => `198.51.100.${(ipCounter += 1) % 250}`;

const signUp = async (email: string) => {
  await request(app)
    .post('/auth/signup')
    .set('X-Forwarded-For', nextIp())
    .send({ name: 'Quiz Host', email, password: 'IntegrationTest#2026', organizationName: 'Answer Lock Co' });

  const login = await request(app)
    .post('/auth/login')
    .set('X-Forwarded-For', nextIp())
    .send({ email, password: 'IntegrationTest#2026' });

  return login.body.token as string;
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Creates a session of the given kind with one MCQ that carries an answer key. */
const setUpSession = async (token: string, preset: 'GAME' | 'SURVEY') => {
  const created = await request(app)
    .post('/events')
    .set(auth(token))
    .send({ title: `${preset} session`, preset })
    .expect(201);

  const event = created.body.event;

  const question = await request(app)
    .post('/questions')
    .set(auth(token))
    .send({
      eventId: event.id,
      type: 'MCQ',
      text: 'Which one?',
      options: ['A', 'B', 'C', 'D'],
      correctOption: 2,
      timeLimit: 120,
    })
    .expect(201);

  const questionId = (question.body.question ?? question.body).id as string;

  // The answer deadline is enforced from currentQuestionStartedAt, so the
  // question has to actually be live before an answer is accepted.
  await prisma.event.update({
    where: { id: event.id },
    data: { isLive: true, currentQuestionId: questionId, currentQuestionStartedAt: new Date() },
  });

  const join = await request(app)
    .post('/participants/join')
    .set('X-Forwarded-For', nextIp())
    .send({ roomCode: event.roomCode, name: 'Voter' })
    .expect(201);

  return {
    eventId: event.id as string,
    questionId,
    participantToken: join.body.participantToken as string,
  };
};

const answer = (participantToken: string, questionId: string, selectedOption: number) =>
  request(app)
    .post('/participants/response')
    .set('x-participant-token', participantToken)
    .send({ questionId, selectedOption });

beforeEach(async () => {
  if (!db) {
    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
  }
  // The batcher is process-wide and outlives a test. Draining it before the
  // truncate stops a previous test's queued answer from being written against
  // rows this one just deleted, which fails the whole flush and takes the
  // current test's answers down with it.
  await responseBatcher.flushNow();
  await truncateAll(db);
  await seedPlans(db);
  invalidatePlanCache();
});

afterAll(async () => {
  await db?.end();
  await prisma.$disconnect();
});

describe('creating a session decides whether its answers are final', () => {
  it('defaults to a scored game when no preset is named', async () => {
    const token = await signUp('default-kind@example.com');
    const created = await request(app)
      .post('/events')
      .set(auth(token))
      .send({ title: 'Unspecified' })
      .expect(201);

    expect(created.body.event.preset).toBe('GAME');
    expect(created.body.event.scoringEnabled).toBe(true);
  });

  it('creates an unscored survey when the host asks for one', async () => {
    const token = await signUp('survey-kind@example.com');
    const created = await request(app)
      .post('/events')
      .set(auth(token))
      .send({ title: 'Town hall', preset: 'SURVEY' })
      .expect(201);

    expect(created.body.event.preset).toBe('SURVEY');
    expect(created.body.event.scoringEnabled).toBe(false);
    expect(created.body.event.sessionMode).toBe('SURVEY');
  });

  it('refuses a preset it does not recognise rather than silently defaulting', async () => {
    const token = await signUp('bad-kind@example.com');
    await request(app)
      .post('/events')
      .set(auth(token))
      .send({ title: 'Nonsense', preset: 'DEFINITELY_NOT_A_PRESET' })
      .expect(400);
  });
});

describe('a graded answer is final', () => {
  it('accepts the first answer and refuses the second', async () => {
    const token = await signUp('graded-lock@example.com');
    const { questionId, participantToken } = await setUpSession(token, 'GAME');

    await answer(participantToken, questionId, 0).expect(200);
    await answer(participantToken, questionId, 2).expect(409);
  });

  it('does not let a second attempt overwrite the score that was recorded', async () => {
    const token = await signUp('no-overwrite@example.com');
    const { questionId, participantToken } = await setUpSession(token, 'GAME');

    // 2 is the key. The exact figure depends on the speed bonus a Game session
    // turns on, so the property under test is that the refusal leaves it alone.
    const first = await answer(participantToken, questionId, 2).expect(200);
    expect(first.body.isCorrect).toBe(true);
    const earned = first.body.score;
    expect(earned).toBeGreaterThan(0);

    await answer(participantToken, questionId, 0).expect(409);

    const me = await request(app)
      .get('/participants/me')
      .set('x-participant-token', participantToken)
      .expect(200);

    expect(me.body.score).toBe(earned);
  });

  it('closes the guess-until-right hole: a wrong first answer cannot be retried', async () => {
    const token = await signUp('no-bruteforce@example.com');
    const { questionId, participantToken } = await setUpSession(token, 'GAME');

    const wrong = await answer(participantToken, questionId, 0).expect(200);
    expect(wrong.body.isCorrect).toBe(false);

    // Knowing it was wrong must not buy another go at the remaining options.
    await answer(participantToken, questionId, 1).expect(409);
    await answer(participantToken, questionId, 2).expect(409);

    const me = await request(app)
      .get('/participants/me')
      .set('x-participant-token', participantToken)
      .expect(200);

    expect(me.body.score).toBe(0);
  });
});

describe('a survey vote can still be changed', () => {
  it('accepts a changed vote instead of locking it', async () => {
    const token = await signUp('survey-open@example.com');
    const { questionId, participantToken } = await setUpSession(token, 'SURVEY');

    await answer(participantToken, questionId, 0).expect(200);
    await answer(participantToken, questionId, 2).expect(200);
    await answer(participantToken, questionId, 1).expect(200);
  });

  it('reveals nothing to grade against, so there is no hole to close', async () => {
    const token = await signUp('survey-silent@example.com');
    const { questionId, participantToken } = await setUpSession(token, 'SURVEY');

    // Option 2 is the key on the underlying question, and the survey must still
    // refuse to say so.
    const onKey = await answer(participantToken, questionId, 2).expect(200);
    expect(onKey.body.scored).toBe(false);
    expect(onKey.body.isCorrect).toBeNull();
    expect(onKey.body.standing).toBeNull();
  });

  it('counts one ballot however many times a person changes their mind', async () => {
    const token = await signUp('survey-tally@example.com');
    const { eventId, questionId, participantToken } = await setUpSession(token, 'SURVEY');

    await answer(participantToken, questionId, 0).expect(200);
    await answer(participantToken, questionId, 3).expect(200);

    // Unscored answers are not flushed on submit — only scored ones are, to
    // keep /standing current — so the write is still in the batcher here.
    await responseBatcher.flushNow();

    const stored = await prisma.response.findMany({ where: { questionId } });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.selectedOption).toBe(3);

    const summary = await request(app)
      .get(`/analytics/events/${eventId}/summary`)
      .set(auth(token))
      .expect(200);

    const tallied = summary.body.questions.find((q: { id: string }) => q.id === questionId);
    expect(tallied.totalResponses).toBe(1);
    expect(tallied.optionCounts).toEqual([0, 0, 0, 1]);
  });
});

describe('answers sent in parallel', () => {
  it('lets exactly one through, so firing every option at once reveals nothing', async () => {
    const token = await signUp('parallel@example.com');
    const { questionId, participantToken } = await setUpSession(token, 'GAME');

    const results = await Promise.all([0, 1, 2, 3].map((opt) => answer(participantToken, questionId, opt)));
    const accepted = results.filter((r) => r.status === 200);

    expect(accepted).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    // Only the one accepted answer ever said whether it was right.
    expect(results.filter((r) => 'isCorrect' in r.body)).toHaveLength(1);

    await responseBatcher.flushNow();
    expect(await prisma.response.count({ where: { questionId } })).toBe(1);
  });
});

describe('answers close when the room can see the results', () => {
  it('refuses a survey vote once the distribution is on screen', async () => {
    const token = await signUp('survey-revealed@example.com');
    const { questionId, participantToken } = await setUpSession(token, 'SURVEY');

    // Open: a survey vote can still change.
    await answer(participantToken, questionId, 0).expect(200);
    await answer(participantToken, questionId, 1).expect(200);

    // The host shows the room the split.
    await prisma.question.update({ where: { id: questionId }, data: { revealedAt: new Date() } });

    // Closed: the numbers everyone just read must not move.
    await answer(participantToken, questionId, 2).expect(409);
  });

  it('refuses a graded answer after the reveal too, for the same reason', async () => {
    const token = await signUp('graded-revealed@example.com');
    const { questionId, participantToken } = await setUpSession(token, 'GAME');

    await prisma.question.update({ where: { id: questionId }, data: { revealedAt: new Date() } });

    await answer(participantToken, questionId, 2).expect(409);
  });

  it('re-opens the question when the host presents it again', async () => {
    const token = await signUp('reveal-reopen@example.com');
    const { questionId, participantToken } = await setUpSession(token, 'SURVEY');

    await prisma.question.update({ where: { id: questionId }, data: { revealedAt: new Date() } });
    await answer(participantToken, questionId, 0).expect(409);

    // What host:nextQuestion does when the same question goes back on screen.
    await prisma.question.update({ where: { id: questionId }, data: { revealedAt: null } });

    await answer(participantToken, questionId, 0).expect(200);
  });

  it('re-opens every question when the host clears the room data', async () => {
    const token = await signUp('reveal-cleared@example.com');
    const { eventId, questionId, participantToken } = await setUpSession(token, 'SURVEY');

    await prisma.question.update({ where: { id: questionId }, data: { revealedAt: new Date() } });

    await request(app).delete(`/events/${eventId}/clear-data`).set(auth(token)).expect(200);

    const after = await prisma.question.findUnique({ where: { id: questionId } });
    expect(after?.revealedAt).toBeNull();
    void participantToken;
  });
});

describe('the reveal itself', () => {
  it('stamps the question as it broadcasts, so answers close on the real path', async () => {
    const token = await signUp('reveal-path@example.com');
    // A game reveals on the host's word; a survey preset never shows the split,
    // so its votes stay open and there is nothing to stamp.
    const { eventId, questionId, participantToken } = await setUpSession(token, 'GAME');

    const sent: string[] = [];
    const io = { to: () => ({ emit: (name: string) => sent.push(name) }) } as never;
    await makeRevealer(io)(eventId, questionId);

    expect(sent).toContain('participant:results');
    expect((await prisma.question.findUnique({ where: { id: questionId } }))?.revealedAt).not.toBeNull();
    // Their first answer, refused only because the key is now on screen.
    await answer(participantToken, questionId, 2).expect(409);
  });
});
