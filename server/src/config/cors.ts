const LOCAL_DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];

/**
 * Normalizes an origin so it can be compared against a browser's Origin header.
 * Hosting dashboards are often configured without a scheme ("app.vercel.app"),
 * which browsers never match, so the scheme is added when missing.
 */
const normalizeOrigin = (value: string): string => {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

/** FRONTEND_URL accepts a single origin or a comma-separated list. */
export const allowedOrigins: string[] = (() => {
  const configured = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

  return configured.length > 0 ? configured : LOCAL_DEV_ORIGINS;
})();

export const isOriginAllowed = (origin: string | undefined): boolean => {
  // Requests without an Origin header (curl, health checks, server-to-server) are not browser cross-origin requests
  if (!origin) return true;
  return allowedOrigins.includes(normalizeOrigin(origin));
};

export const corsOriginHandler = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void => {
  if (isOriginAllowed(origin)) {
    callback(null, true);
    return;
  }
  console.warn(`🚫 Blocked CORS request from origin: ${origin}`);
  callback(null, false);
};
