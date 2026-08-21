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
