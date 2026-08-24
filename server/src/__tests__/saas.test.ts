import { describe, expect, it } from 'vitest';
import { limitsFor, PLAN_LIMITS, currentPeriod } from '../utils/plans';
import { normalizeQuestionInput, scoreAnswer } from '../utils/questionTypes';
import { normalizeEmail, parsePagination, validateNewUser, validateLogoUrl } from '../utils/validation';
import { generateParticipantToken, verifyParticipantToken } from '../utils/participantToken';
import { generateToken, verifyToken } from '../utils/auth';
import { hashSecret } from '../utils/mailer';

describe('plan limits', () => {
  it('falls back to FREE when the plan is missing', () => {
    expect(limitsFor(undefined).eventsPerMonth).toBe(PLAN_LIMITS.FREE.eventsPerMonth);
  });

  it('formats the billing period as YYYY-MM', () => {
    expect(currentPeriod(new Date('2026-08-21T00:00:00Z'))).toBe('2026-08');
  });
});

describe('question types', () => {
  it('defaults omitted type to MCQ so old clients keep working', () => {
    const parsed = normalizeQuestionInput({
      text: 'Capital of France?',
      options: ['Paris', 'Lyon', 'Nice', 'Lille'],
      correctOption: 0,
    });
    expect('value' in parsed && parsed.value.type).toBe('MCQ');
  });

  it('allows open text without options', () => {
    const parsed = normalizeQuestionInput({ type: 'OPEN_TEXT', text: 'Any comments?' });
    expect('value' in parsed).toBe(true);
  });

  it('rejects MCQ with fewer than two options', () => {
    const parsed = normalizeQuestionInput({ text: 'Only one', options: ['A'] });
    expect('error' in parsed).toBe(true);
  });

  it('scores multi-select only on an exact match', () => {
    expect(scoreAnswer({ type: 'MULTI_SELECT', correctOption: null, correctOptions: [0, 2] }, 0, [2, 0])).toEqual({
      isCorrect: true,
      score: 1,
    });
    expect(scoreAnswer({ type: 'MULTI_SELECT', correctOption: null, correctOptions: [0, 2] }, 0, [0])).toEqual({
      isCorrect: false,
      score: 0,
    });
  });
});

describe('validation', () => {
  it('normalizes email casing', () => {
    expect(normalizeEmail('  Admin@QuizPulse.com ')).toBe('admin@quizpulse.com');
  });

  it('clamps pagination', () => {
    expect(parsePagination({ page: '0', limit: '999' }, { defaultLimit: 25, maxLimit: 100 })).toEqual({
      skip: 0,
      take: 100,
      page: 1,
      limit: 100,
    });
  });

  it('rejects short passwords', () => {
    const parsed = validateNewUser({ name: 'Ada', email: 'ada@example.com', password: 'short' });
    expect('error' in parsed).toBe(true);
  });
});

describe('tokens', () => {
  it('issues a participant token that cannot authenticate a host', () => {
    const token = generateParticipantToken('p1', 'e1');
    expect(verifyParticipantToken(token)?.participantId).toBe('p1');
    expect(verifyToken(token)).toBeNull();
  });

  it('issues a host token that carries the token version', () => {
    const token = generateToken('u1', 'a@b.com', 'STAFF', 3);
    expect(verifyToken(token)).toMatchObject({ userId: 'u1', role: 'STAFF', tokenVersion: 3 });
  });

  it('hashes invite tokens one-way', () => {
    expect(hashSecret('abc')).toHaveLength(64);
    expect(hashSecret('abc')).toBe(hashSecret('abc'));
    expect(hashSecret('abc')).not.toBe(hashSecret('abd'));
  });
});

describe('logo URLs that go on a screen in front of a room', () => {
  it('accepts an ordinary https image URL', () => {
    const result = validateLogoUrl('https://cdn.example.com/logo.png');
    expect(result.ok).toBe(true);
  });

  it('treats blank as cleared rather than invalid', () => {
    expect(validateLogoUrl('')).toEqual({ ok: true, value: null });
    expect(validateLogoUrl(null)).toEqual({ ok: true, value: null });
  });

  it('rejects a javascript: URL', () => {
    // An img src will not execute it in a current browser, but the value is
    // stored and nothing guarantees it is only ever used in an img tag.
    expect(validateLogoUrl('javascript:alert(document.cookie)').ok).toBe(false);
  });

  it('rejects a data: URL', () => {
    expect(validateLogoUrl('data:image/svg+xml,<svg onload=alert(1)>').ok).toBe(false);
  });

  it('rejects plain http', () => {
    // Blocked as mixed content on an https page, so the logo silently vanishes.
    expect(validateLogoUrl('http://cdn.example.com/logo.png').ok).toBe(false);
  });

  it('rejects credentials embedded in the URL', () => {
    // Renders fine and leaks whatever was put in it to anyone opening settings.
    expect(validateLogoUrl('https://user:hunter2@cdn.example.com/logo.png').ok).toBe(false);
  });

  it('rejects something that is not a URL at all', () => {
    expect(validateLogoUrl('not a url').ok).toBe(false);
  });

  it('rejects an absurdly long URL', () => {
    expect(validateLogoUrl(`https://example.com/${'a'.repeat(3000)}`).ok).toBe(false);
  });
});
