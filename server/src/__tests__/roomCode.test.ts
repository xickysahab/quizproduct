import { describe, expect, it } from 'vitest';
import { generateRoomCode, formatRoomCode, normalizeRoomCode } from '../utils/roomCode';

describe('join codes (BUG-20)', () => {
  const codes = Array.from({ length: 400 }, () => generateRoomCode());

  it('produces seven digits', () => {
    codes.forEach((code) => expect(code).toMatch(/^\d{7}$/));
  });

  it('never contains a letter, so 0/O and 1/I cannot be confused', () => {
    codes.forEach((code) => expect(code).not.toMatch(/[A-Za-z]/));
  });

  it('never starts with zero — a leading zero is lost when read aloud', () => {
    codes.forEach((code) => expect(code.startsWith('0')).toBe(false));
  });

  it('never returns a single repeated digit', () => {
    codes.forEach((code) => expect(code).not.toMatch(/^(\d)\1+$/));
  });

  it('does not collide often across many draws', () => {
    // Not a uniqueness guarantee — the database has the unique index — but a
    // generator producing frequent duplicates would show up here.
    expect(new Set(codes).size).toBeGreaterThan(codes.length - 3);
  });

  it('groups a code for display', () => {
    expect(formatRoomCode('1234567')).toBe('123 4567');
  });

  it('leaves a legacy alphanumeric code ungrouped', () => {
    expect(formatRoomCode('A1B2C3')).toBe('A1B2C3');
  });

  it('strips spaces and hyphens people paste in', () => {
    expect(normalizeRoomCode(' 123 4567 ')).toBe('1234567');
    expect(normalizeRoomCode('123-4567')).toBe('1234567');
  });

  it('uppercases so legacy codes still match', () => {
    expect(normalizeRoomCode('a1b2c3')).toBe('A1B2C3');
  });
});
