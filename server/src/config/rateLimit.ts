import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit';
import { ParticipantRequest } from '../middleware/participant.middleware';
import { verifyParticipantToken } from '../utils/participantToken';
import Redis from 'ioredis';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { env } from './env';

/**
 * Where the counts live. In memory on one process; in Redis once REDIS_URL is
 * set, because with two processes behind a load balancer each kept its own
 * count, so every limit — the login brute-force limit included — was
 * silently doubled.
 *
 * Its own connection, not the socket adapter's: the limiters are built as this
 * module loads, before that one connects. Until this one is up, requests pass
 * unlimited rather than wait.
 */
// enableOfflineQueue is off so that with Redis unreachable a command fails at
// once and passOnStoreError lets the request through. With the queue on, a
// Redis outage held every request open until it timed out — worse than having
// no limit at all.
const limiterRedis = env.redisUrl
  ? new Redis(env.redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 2000 })
  : null;

export const closeLimiterRedis = async (): Promise<void> => {
  await limiterRedis?.quit().catch(() => undefined);
};

const storeFor = (name: string): Partial<Options> =>
  limiterRedis
    ? {
        store: new RedisStore({
          prefix: `rl:${name}:`,
          sendCommand: (command: string, ...args: string[]) =>
            limiterRedis.call(command, ...args) as Promise<RedisReply>,
        }),
      }
    : {};

const shared: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // If Redis is unreachable, let the request through rather than fail it: a
  // rate limit is not worth stopping a classroom mid-quiz.
  passOnStoreError: true,
};

/**
 * Brute-force protection. Counts only failures, and keys on the account as well
 * as the network: a venue shares one public IP, so an IP-only key let ten wrong
 * passwords for one account lock out everyone behind it — the same reasoning the
 * response limiter below applies per participant.
 */
export const loginLimiter = rateLimit({
  ...shared,
  ...storeFor('login'),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  // ipKeyGenerator normalises IPv6 to a /56, so a client cannot walk its own
  // address space for a fresh budget.
  keyGenerator: (req) => {
    const email =
      typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `${ipKeyGenerator(req.ip ?? '')}:${email}`;
  },
  message: { message: 'Too many failed sign-in attempts. Please try again in 15 minutes.' },
});

/**
 * Account creation.
 *
 * Deliberately NOT the login limiter, which skips successful requests so a busy
 * office signing in normally is never locked out. On signup the successful
 * requests are precisely the abuse: every one creates an account and an
 * organisation, and sends a verification email to whatever address was typed.
 * Reusing the login limiter here made unlimited account creation free, and
 * turned the service into an open relay for mail to arbitrary addresses —
 * which burns the sending domain's reputation long before anyone notices.
 *
 * Colleagues are added by invitation, not by signing up repeatedly, so a low
 * ceiling costs a real workspace nothing.
 */
export const signupLimiter = rateLimit({
  ...shared,
  ...storeFor('signup'),
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { message: 'Too many accounts created from this network. Please try again later.' },
});

/**
 * Password reset requests.
 *
 * Same reasoning: a successful request is one email sent to an address the
 * requester named, so counting only failures counts nothing at all. Someone
 * else's inbox is the thing being protected here, not this server.
 */
export const passwordResetLimiter = rateLimit({
  ...shared,
  ...storeFor('reset'),
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { message: 'Too many reset requests. Please try again in an hour.' },
});

/**
 * Counts failed joins only. A lecture hall shares one public IP, and a load
 * test showed a 500-seat room stopping at 200 when successes counted too. The
 * abuse this exists for — guessing room codes, guessing a passcode — is made
 * of failures, and the per-event participant cap bounds the rest.
 *
 * ponytail: a request is counted on arrival and forgiven when it succeeds, so
 * more than 200 joins in flight at the same instant from one IP still trips
 * it. A room joining over a few seconds never does (2,000 held in the load
 * test); key successes separately if a venue ever shows otherwise.
 */
export const joinLimiter = rateLimit({
  ...shared,
  ...storeFor('join'),
  windowMs: 5 * 60 * 1000,
  limit: 200,
  skipSuccessfulRequests: true,
  message: { message: 'Too many join attempts from this network. Please wait a moment.' },
});

/**
 * Keyed on the participant rather than the IP — hundreds of people answering
 * from the same venue Wi-Fi must not throttle each other, but one client
 * looping requests should be stopped.
 */
export const responseLimiter = rateLimit({
  ...shared,
  ...storeFor('response'),
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: (req) => (req as ParticipantRequest).participant?.participantId ?? 'anonymous',
  message: { message: 'Too many answers submitted. Please slow down.' },
});

/**
 * Backstop for the whole API. A participant is counted as themselves, by their
 * verified room token, not by IP: keyed on IP, one school hall answering a
 * question hit the ceiling after its hundredth answer. A forged token fails
 * verification and is counted by IP like anything else.
 */
export const apiLimiter = rateLimit({
  ...shared,
  ...storeFor('api'),
  windowMs: 60 * 1000,
  limit: 600,
  keyGenerator: (req) => {
    const token = req.headers['x-participant-token'];
    const participant = typeof token === 'string' ? verifyParticipantToken(token) : null;
    return participant ? `participant:${participant.participantId}` : ipKeyGenerator(req.ip ?? '');
  },
  // Joining has its own limiter (joinLimiter). Counted here as well, by IP, a
  // hall of a thousand behind one NAT stops joining at six hundred.
  skip: (req) =>
    (req.method === 'POST' && req.path === '/participants/join') ||
    (req.method === 'GET' && req.path.startsWith('/events/public/')),
  message: { message: 'Too many requests. Please slow down.' },
});

/**
 * Question submission. Tighter than the answer limit — a question is a
 * deliberate act, and a flood of them is the main Q&A abuse vector.
 */
export const qaSubmitLimiter = rateLimit({
  ...shared,
  ...storeFor('qa'),
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (req) => (req as ParticipantRequest).participant?.participantId ?? 'anonymous',
  message: { message: 'You are posting questions too quickly. Please wait a moment.' },
});
