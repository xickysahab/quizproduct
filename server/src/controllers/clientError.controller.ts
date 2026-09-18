import { Request, Response } from 'express';
import { report } from '../utils/errorReporter';

const clip = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value ? value.slice(0, max) : undefined;

/**
 * Errors from browsers. A participant's phone crashing mid-quiz used to end
 * in the console of that phone and nowhere else. They go through the same
 * report() as server errors — logged, and pushed to ALERT_WEBHOOK_URL with
 * its one-alert-per-message cooldown.
 *
 * Unauthenticated, because a crash can happen before anyone signs in; so it is
 * rate-limited, every field is clipped, and it never echoes anything back.
 */
export const receiveClientError = (req: Request, res: Response): void => {
  const body = typeof req.body === 'object' && req.body ? req.body : {};
  const message = clip(body.message, 500);
  if (message) {
    const error = new Error(message);
    error.stack = clip(body.stack, 4000) ?? error.stack;
    report('client.error', error, {
      kind: clip(body.kind, 20),
      path: clip(body.path, 200),
      userAgent: clip(req.headers['user-agent'], 200),
    });
  }
  res.status(204).end();
};
