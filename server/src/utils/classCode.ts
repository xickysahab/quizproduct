import crypto from 'crypto';

/**
 * Class join codes: six characters, letters and digits, none of 0/O/1/I.
 *
 * Deliberately not the seven-digit shape of a live room code, so a student
 * never types a class code into the room box (or the reverse) and gets a
 * confusing "not found". 32^6 is about a billion, and joins are rate limited.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

export const generateClassCode = (): string => {
  let code = '';
  for (let i = 0; i < LENGTH; i += 1) code += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  return code;
};

/** Accepts what people actually type: lower case, spaces, a pasted link. */
export const normalizeClassCode = (input: unknown): string | null => {
  if (typeof input !== 'string') return null;
  const code = input.trim().split('/').pop()!.replace(/[\s-]/g, '').toUpperCase();
  return code.length === LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : null;
};
