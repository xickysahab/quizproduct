import rateLimit, { Options } from 'express-rate-limit';
import { ParticipantRequest } from '../middleware/participant.middleware';

const shared: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
};

/**
 * Brute-force protection. Deliberately counts only failures so a busy office
 * signing in normally is never locked out.
 */
export const loginLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
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
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { message: 'Too many reset requests. Please try again in an hour.' },
});

/**
 * Joins are limited generously: a lecture hall or office shares one public IP,
 * so the real flood protection is the per-event participant cap. This only
 * blunts scripted signup loops.
 */
export const joinLimiter = rateLimit({
  ...shared,
  windowMs: 5 * 60 * 1000,
  limit: 200,
  message: { message: 'Too many join attempts from this network. Please wait a moment.' },
});

/**
 * Keyed on the participant rather than the IP — hundreds of people answering
 * from the same venue Wi-Fi must not throttle each other, but one client
 * looping requests should be stopped.
 */
export const responseLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: (req) => (req as ParticipantRequest).participant?.participantId ?? 'anonymous',
  message: { message: 'Too many answers submitted. Please slow down.' },
});

/** Backstop for the authenticated dashboard API. */
export const apiLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 600,
  message: { message: 'Too many requests. Please slow down.' },
});

/**
 * Question submission. Tighter than the answer limit — a question is a
 * deliberate act, and a flood of them is the main Q&A abuse vector.
 */
export const qaSubmitLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (req) => (req as ParticipantRequest).participant?.participantId ?? 'anonymous',
  message: { message: 'You are posting questions too quickly. Please wait a moment.' },
});
