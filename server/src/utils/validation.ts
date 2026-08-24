export const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 80;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Postgres treats `A@b.com` and `a@b.com` as different values, so without
 * normalizing, the same person can end up with two accounts and be unable to
 * sign in with the casing they remember.
 */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export interface NewUserInput {
  name: string;
  email: string;
  password: string;
}

/** Returns an error message for the caller, or null when the input is usable. */
export const validateNewUser = (body: unknown): { error: string } | { value: NewUserInput } => {
  const { name, email, password } = (body ?? {}) as Record<string, unknown>;

  if (typeof name !== 'string' || !name.trim()) {
    return { error: 'Name is required.' };
  }

  if (name.trim().length > MAX_NAME_LENGTH) {
    return { error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  }

  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    return { error: 'A valid email address is required.' };
  }

  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  return {
    value: {
      name: name.trim(),
      email: normalizeEmail(email),
      password,
    },
  };
};

/** Clamps client-supplied paging into a range that cannot exhaust the database. */
export const parsePagination = (
  query: Record<string, unknown>,
  { defaultLimit = 25, maxLimit = 100 } = {}
): { skip: number; take: number; page: number; limit: number } => {
  const rawPage = Number(query.page);
  const rawLimit = Number(query.limit);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), maxLimit) : defaultLimit;

  return { skip: (page - 1) * limit, take: limit, page, limit };
};

/**
 * A logo URL that is safe to put on a screen in front of a room.
 *
 * This is rendered as an `<img src>` on the join screen every participant
 * sees, so it is worth being strict about. Three things are being prevented:
 *
 * `javascript:` and `data:` schemes — an image source will not execute a
 * javascript: URL in any current browser, but the value is stored and nothing
 * guarantees it is only ever used in an img tag. Rejecting non-https at the
 * boundary means the question never has to be asked again.
 *
 * Plain http — the app is served over https, so an http image is blocked as
 * mixed content and the logo silently does not appear.
 *
 * Credentials in the URL — `https://user:pass@host/logo.png` renders fine and
 * leaks whatever was put in it to anyone who opens the settings page.
 *
 * What this deliberately does NOT prevent: the URL still points at a third
 * party, which can log every participant's IP and user agent. Only hosting the
 * image ourselves fixes that, and that is an upload pipeline, not a validator.
 */
export const validateLogoUrl = (
  value: unknown
): { ok: true; value: string | null } | { ok: false; message: string } => {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, message: 'Logo URL must be text.' };

  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };

  if (trimmed.length > 2048) {
    return { ok: false, message: 'That logo URL is too long.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: 'That does not look like a valid URL.' };
  }

  if (parsed.protocol !== 'https:') {
    return {
      ok: false,
      message: 'The logo URL must start with https:// — anything else is blocked by the browser or unsafe.',
    };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, message: 'The logo URL must not contain a username or password.' };
  }

  return { ok: true, value: parsed.toString() };
};
