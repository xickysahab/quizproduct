/**
 * Display helpers for join codes. The generator lives on the server; this is
 * only about how a code is shown and typed.
 */

/** Groups a numeric code for reading aloud: 1234567 → "123 4567". */
export const formatRoomCode = (code: string): string =>
  /^\d{7}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

/** Strips whatever people paste in, and uppercases legacy alphanumeric codes. */
export const normalizeRoomCode = (input: string): string =>
  input.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
