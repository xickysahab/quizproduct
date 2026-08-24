import crypto from 'crypto';

/**
 * Join codes.
 *
 * Numeric, seven digits, in the shape Slido uses — and for the same reason:
 * a code is read aloud off a projector and typed on a phone. The previous
 * six-character alphanumeric codes drew from an alphabet containing 0/O and
 * 1/I, the two pairs people reliably mistype, and used `Math.random`.
 *
 * Existing alphanumeric codes keep working: lookup is by exact match, so old
 * events are unaffected.
 */

const CODE_LENGTH = 7;

/** Rejects codes that are hard to read back or look like a placeholder. */
const isWeak = (code: string): boolean => {
  if (/^(\d)\1+$/.test(code)) return true; // 1111111
  if (code.startsWith('0')) return true; // leading zero gets lost when spoken
  return false;
};

export const generateRoomCode = (): string => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = '';
    // crypto.randomInt, not Math.random — a guessable code is a way into a
    // room you were not invited to.
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += String(crypto.randomInt(0, 10));
    }
    if (!isWeak(code)) return code;
  }

  // Astronomically unlikely; still better than looping forever.
  return String(crypto.randomInt(1_000_000, 10_000_000));
};

/** Groups a code for display: 1234567 → "123 4567". */
export const formatRoomCode = (code: string): string =>
  /^\d{7}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

/** Strips spaces and hyphens people paste in, and uppercases legacy codes. */
export const normalizeRoomCode = (input: string): string =>
  input.replace(/[\s-]+/g, '').toUpperCase();
