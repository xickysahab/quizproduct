import 'dotenv/config';
import { sellerIdentityGaps, sellerStateMismatch, isGstRegistered } from './seller';

/**
 * A development-only signing key.
 *
 * It is committed, so it is public, so it is worthless as a secret — which is
 * fine for a laptop and catastrophic anywhere else. Production refuses to boot
 * rather than falling back to it: this key signs both host logins and
 * participant tokens, so anyone who can read the repository could otherwise
 * mint themselves a SUPERADMIN session on any deployment that forgot to set
 * JWT_SECRET, and the only thing standing in the way was a warning in a log.
 */
const DEV_JWT_SECRET = 'super_secret_slido_key_for_development';
const MIN_SECRET_LENGTH = 32;

const isProduction = process.env.NODE_ENV === 'production';

const readInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const rawJwtSecret = process.env.JWT_SECRET?.trim();

const firstFrontendOrigin = (): string => {
  const configured = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .map((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`));
  return configured[0] || 'http://localhost:5173';
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  port: readInt(process.env.PORT, 5001),
  jwtSecret: rawJwtSecret || DEV_JWT_SECRET,
  hostTokenTtl: process.env.HOST_TOKEN_TTL || '7d',
  participantTokenTtl: process.env.PARTICIPANT_TOKEN_TTL || '12h',
  maxParticipantsPerEvent: readInt(process.env.MAX_PARTICIPANTS_PER_EVENT, 1000),
  /** Ceiling for accounts with no plan, so a deck cannot grow unrenderable. */
  maxQuestionsHardCap: readInt(process.env.MAX_QUESTIONS_HARD_CAP, 500),
  answerGracePeriodSeconds: readInt(process.env.ANSWER_GRACE_PERIOD_SECONDS, 3),
  redisUrl: process.env.REDIS_URL?.trim() || undefined,
  resendApiKey: process.env.RESEND_API_KEY?.trim() || undefined,
  mailFrom: process.env.MAIL_FROM?.trim() || 'QuizPulse <noreply@quizpulse.app>',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY?.trim() || undefined,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
  stripePricePro: process.env.STRIPE_PRICE_PRO?.trim() || undefined,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID?.trim() || undefined,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET?.trim() || undefined,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || undefined,
  frontendOrigin: firstFrontendOrigin(),
} as const;

/**
 * Secrets that production must not start without.
 *
 * Thrown at module load rather than checked at request time, so a
 * misconfigured deployment fails immediately and visibly instead of serving
 * traffic that anyone can forge their way into. This mirrors what
 * `ensureSuperAdmin` already does for SUPERADMIN_PASSWORD — the same standard,
 * applied to the secret that protects every session on the platform.
 */
const assertProductionSecrets = (): void => {
  if (!isProduction) return;

  if (!rawJwtSecret) {
    throw new Error(
      'JWT_SECRET is not set. Refusing to start in production with the public development key — it is committed to the repository, so anyone could forge an administrator session. Generate one with `openssl rand -base64 48`.'
    );
  }

  if (rawJwtSecret === DEV_JWT_SECRET) {
    throw new Error(
      'JWT_SECRET is set to the public development key. Generate a real one with `openssl rand -base64 48`.'
    );
  }

  if (rawJwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET is only ${rawJwtSecret.length} characters. Use at least ${MIN_SECRET_LENGTH} — a short signing key is a brute-forceable one.`
    );
  }
};

assertProductionSecrets();

export const configWarnings = (): string[] => {
  const warnings: string[] = [];

  if (!rawJwtSecret) {
    warnings.push(
      'JWT_SECRET is not set — using the public development key. Anyone can forge login and participant tokens. Production refuses to start without a real one; set it before serving anybody.'
    );
  } else if (rawJwtSecret.length < MIN_SECRET_LENGTH) {
    warnings.push(
      `JWT_SECRET is only ${rawJwtSecret.length} characters. Use at least ${MIN_SECRET_LENGTH} random characters (e.g. \`openssl rand -base64 48\`).`
    );
  }

  if (!env.redisUrl) {
    warnings.push(
      'REDIS_URL is not set — running in single-instance mode. Do not scale past one server process or live quizzes will break.'
    );
  }

  if (!process.env.SUPERADMIN_PASSWORD) {
    warnings.push(
      'SUPERADMIN_PASSWORD is not set — no administrator account will be created. Set it before first boot.'
    );
  }

  if (!process.env.RAZORPAY_KEY_ID) {
    warnings.push(
      'RAZORPAY_KEY_ID is not set — Indian customers cannot pay. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET to enable checkout.'
    );
  }

  if (!env.resendApiKey) {
    warnings.push('RESEND_API_KEY is not set — invite and reset emails are logged to stdout instead of sent.');
  }

  // Only worth warning about once payments are switched on. Before that no
  // invoice is ever issued and the fields have nothing to be missing from.
  if (process.env.RAZORPAY_KEY_ID) {
    const gaps = sellerIdentityGaps();
    if (gaps.length > 0) {
      warnings.push(
        `Billing documents will be issued without a complete supplier identity (missing: ${gaps.join(', ')}). Every invoice and bill of supply must carry the supplier's name and address.`
      );
    }

    if (!isGstRegistered()) {
      warnings.push(
        'SELLER_GSTIN is not set — selling as an unregistered supplier. No GST will be charged and customers receive a bill of supply rather than a tax invoice. This is correct below the registration threshold; set SELLER_GSTIN once registered, or GST will be under-collected.'
      );
    }

    const mismatch = sellerStateMismatch();
    if (mismatch) warnings.push(mismatch);
  }

  return warnings;
};
