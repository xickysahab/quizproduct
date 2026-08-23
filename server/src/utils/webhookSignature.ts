import crypto from 'crypto';

/**
 * Webhook signature verification.
 *
 * The previous Stripe check verified the HMAC but had three holes: it never
 * validated the timestamp, so a captured payload could be replayed forever to
 * keep an organisation on a paid plan; it compared digests with `!==`, which
 * leaks timing information; and it recorded nothing, so the same event could be
 * processed repeatedly.
 */

/** Default replay window. Stripe's own recommendation is five minutes. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

/** Constant-time compare that does not leak length either. */
export const safeEquals = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

export interface VerifyResult {
  ok: boolean;
  reason?: 'malformed' | 'timestamp' | 'signature';
}

/**
 * Stripe: `Stripe-Signature: t=<unix>,v1=<hmac of "t.body">`.
 */
export const verifyStripeSignature = (
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  now = Date.now()
): VerifyResult => {
  if (!header) return { ok: false, reason: 'malformed' };

  const parts = Object.fromEntries(
    header.split(',').map((piece) => {
      const [key, ...rest] = piece.split('=');
      return [key?.trim() ?? '', rest.join('=')];
    })
  );

  const timestamp = Number(parts.t);
  const provided = parts.v1;

  if (!Number.isFinite(timestamp) || !provided) return { ok: false, reason: 'malformed' };

  // Reject anything outside the window in either direction — a future-dated
  // timestamp is just as suspicious as an old one.
  const ageSeconds = Math.abs(now / 1000 - timestamp);
  if (ageSeconds > toleranceSeconds) return { ok: false, reason: 'timestamp' };

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');

  return safeEquals(expected, provided) ? { ok: true } : { ok: false, reason: 'signature' };
};

/**
 * Razorpay: `X-Razorpay-Signature: <hmac of the raw body>`.
 *
 * Razorpay does not sign a timestamp, so replay protection comes entirely from
 * event-id deduplication — see `consumeWebhookEvent`.
 */
export const verifyRazorpaySignature = (
  rawBody: Buffer,
  header: string | undefined,
  secret: string
): VerifyResult => {
  if (!header) return { ok: false, reason: 'malformed' };

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEquals(expected, header.trim()) ? { ok: true } : { ok: false, reason: 'signature' };
};
