import 'dotenv/config';

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
  answerGracePeriodSeconds: readInt(process.env.ANSWER_GRACE_PERIOD_SECONDS, 3),
  redisUrl: process.env.REDIS_URL?.trim() || undefined,
  resendApiKey: process.env.RESEND_API_KEY?.trim() || undefined,
  mailFrom: process.env.MAIL_FROM?.trim() || 'QuizPulse <noreply@quizpulse.app>',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY?.trim() || undefined,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
  stripePricePro: process.env.STRIPE_PRICE_PRO?.trim() || undefined,
  frontendOrigin: firstFrontendOrigin(),
} as const;

export const configWarnings = (): string[] => {
  const warnings: string[] = [];

  if (!rawJwtSecret) {
    warnings.push(
      'JWT_SECRET is not set — falling back to a public development secret. Anyone can forge login tokens. Set it before serving real users.'
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

  if (isProduction && !process.env.SUPERADMIN_PASSWORD) {
    warnings.push('SUPERADMIN_PASSWORD is not set — the default bootstrap password is in use.');
  }

  if (!env.resendApiKey) {
    warnings.push('RESEND_API_KEY is not set — invite and reset emails are logged to stdout instead of sent.');
  }

  return warnings;
};
