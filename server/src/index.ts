import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createApp } from './app';
import { initializeSocket } from './socket';
import { ensureSuperAdmin } from './utils/bootstrap';
import { allowedOrigins, corsOriginHandler } from './config/cors';
import { env, configWarnings } from './config/env';
import { expireOverdueSubscriptions } from './controllers/billing.controller';
import { sweepRetention } from './utils/retention';
import { endAbandonedSessions } from './utils/liveSessions';
import { attachSocketAdapter, closeRedis } from './config/redis';
import { responseBatcher } from './utils/responseBatcher';
import { slog } from './utils/slog';
import { report, alertingConfigured } from './utils/errorReporter';

const app = createApp();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: corsOriginHandler,
    methods: ['GET', 'POST'],
  },
});

/**
 * Hourly, so a lapsed workspace's stored row catches up with reality.
 *
 * Access control does not wait for this — `resolvePlanState` already reads a
 * run-out period as the free tier at request time. This only keeps the
 * database honest, so admin screens and any export built from `plan` are not
 * quietly a month stale. An hour is frequent enough for that and cheap enough
 * to run on the same box as the live sockets.
 */
const SUBSCRIPTION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Erasure runs daily, not hourly: the windows it enforces are measured in
 * hundreds of days, so a slower cadence changes nothing except how often a
 * deletion query touches a box that is also running live sessions.
 */
const RETENTION_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const sweepSubscriptions = async () => {
  try {
    const ended = await endAbandonedSessions();
    if (ended > 0) slog('info', 'sessions.abandoned_ended', { ended });
  } catch (error) {
    slog('error', 'sessions.sweep_failed', { error: error instanceof Error ? error.message : String(error) });
  }
  try {
    const lapsed = await expireOverdueSubscriptions();
    if (lapsed > 0) slog('info', 'billing.sweep_completed', { lapsed });
  } catch (error) {
    // A failed sweep must not take the process down with it — live sessions
    // are running on this box, and enforcement is correct without it anyway.
    slog('error', 'billing.sweep_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const sweepOldData = async () => {
  try {
    await sweepRetention();
  } catch (error) {
    // Same reasoning as the billing sweep: a failed pass is retried tomorrow,
    // and taking the process down would end every live session on it.
    slog('error', 'retention.sweep_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const start = async () => {
  await attachSocketAdapter(io);
  initializeSocket(io);

  httpServer.listen(env.port, () => {
    slog('info', 'server.listening', { port: env.port, origins: allowedOrigins });
    configWarnings().forEach((warning) => slog('warn', 'config.warning', { warning }));

    if (!alertingConfigured()) {
      slog('warn', 'config.warning', {
        warning:
          'ALERT_WEBHOOK_URL is not set — errors are logged but nobody is told. Set it to a Slack or Discord incoming webhook so a failure during a live session reaches a person.',
      });
    }
    void sweepSubscriptions();
    setInterval(() => void sweepSubscriptions(), SUBSCRIPTION_SWEEP_INTERVAL_MS).unref();

    void sweepOldData();
    setInterval(() => void sweepOldData(), RETENTION_SWEEP_INTERVAL_MS).unref();

    void ensureSuperAdmin().catch((error) => {
      // A refusal to create a default-password administrator is fatal in
      // production — better to fail the deploy than to serve with one.
      console.error('Bootstrap failed:', error);
      process.exit(1);
    });
  });
};

const shutdown = async (signal: string) => {
  console.log(`${signal} received — draining queued responses before exit.`);
  try {
    await responseBatcher.shutdown();
    await closeRedis();
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  httpServer.close(() => process.exit(0));
  // Don't hang forever if sockets refuse to close.
  setTimeout(() => process.exit(0), 10000).unref();
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

/**
 * An unhandled rejection terminates the process by default in modern Node.
 *
 * One missed `.catch()` anywhere therefore takes down every live session on
 * this box — mid-question, with a room watching. Catching it here turns a
 * guaranteed outage into a logged error, and pm2 is not asked to restart over
 * something the process survived.
 */
process.on('unhandledRejection', (reason) => {
  report('process.unhandled_rejection', reason);
});

/**
 * An uncaught exception is different: execution unwound from an unknown point,
 * so process state cannot be trusted afterwards. Report it, drain what can be
 * drained, and let the supervisor start a clean one.
 */
process.on('uncaughtException', (error) => {
  report('process.uncaught_exception', error);
  void shutdown('uncaughtException');
});

void start();
