import { slog } from './slog';

/**
 * Where errors go when nobody is watching the logs.
 *
 * Structured logging already exists, and logs are only useful to someone who
 * happens to be reading them. What was missing is the push: a live session
 * failing at 10am on a Tuesday needs to reach a person, not a file on an EC2
 * box that gets tailed the next time somebody complains.
 *
 * Deliberately dependency-free and webhook-shaped, because a Slack or Discord
 * incoming webhook is what a small team actually has on day one. If this grows
 * into wanting stack-trace grouping and release tracking, Sentry slots in at
 * exactly this seam — `report` is the only thing the rest of the code calls.
 */

const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL?.trim() || undefined;
const ENVIRONMENT = process.env.NODE_ENV || 'development';

export const alertingConfigured = (): boolean => Boolean(WEBHOOK_URL);

/**
 * Alerts are rate-limited per message.
 *
 * A crash loop or a database that has gone away produces the same error
 * hundreds of times a minute. Forwarding every one of them buries the alert
 * that mattered and, on a free webhook tier, gets the integration throttled
 * off entirely — so the one time it needed to work, it does not.
 */
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_TRACKED_KEYS = 500;

/**
 * One alert per distinct message per cooldown.
 *
 * Built as a factory so the rule can be tested without waiting five real
 * minutes, and so the clock is passed in rather than read from inside.
 */
export const createAlertThrottle = (cooldownMs = ALERT_COOLDOWN_MS) => {
  const lastSent = new Map<string, number>();

  return (key: string, now: number): boolean => {
    const previous = lastSent.get(key);
    if (previous !== undefined && now - previous < cooldownMs) return false;
    lastSent.set(key, now);

    // Keyed by error text, which is bounded in practice but not by anything
    // enforced. Trim rather than let a process running for months accumulate
    // an entry per distinct message.
    if (lastSent.size > MAX_TRACKED_KEYS) {
      for (const [entry, at] of lastSent) {
        if (now - at > cooldownMs) lastSent.delete(entry);
      }
    }

    return true;
  };
};

const shouldSend = createAlertThrottle();

export interface ErrorContext {
  [key: string]: unknown;
}

/**
 * Records an error, and pushes it out if alerting is configured.
 *
 * Never throws and never rejects. This is called from crash handlers, and an
 * error reporter that can itself fail inside an error handler turns one
 * problem into a silent two.
 */
export const report = (
  event: string,
  error: unknown,
  context: ErrorContext = {}
): void => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  slog('error', event, { ...context, error: message, stack });

  if (!WEBHOOK_URL) return;
  if (!shouldSend(`${event}:${message}`, Date.now())) return;

  const lines = [
    `*${event}* — ${ENVIRONMENT}`,
    message,
    ...Object.entries(context).map(([key, value]) => `${key}: ${String(value)}`),
    stack ? `\`\`\`${stack.split('\n').slice(0, 8).join('\n')}\`\`\`` : '',
  ].filter(Boolean);

  void fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: lines.join('\n') }),
    signal: AbortSignal.timeout(5000),
  }).catch((sendError) => {
    // Log it and stop. Retrying an alert about a failure with an alert that is
    // itself failing is how a bad minute becomes a bad hour.
    slog('warn', 'alert.delivery_failed', {
      error: sendError instanceof Error ? sendError.message : String(sendError),
    });
  });
};
