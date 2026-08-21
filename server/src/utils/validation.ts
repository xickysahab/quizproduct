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
