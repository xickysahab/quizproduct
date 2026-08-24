import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.routes';
import eventRoutes from './routes/event.routes';
import questionRoutes from './routes/question.routes';
import participantRoutes from './routes/participant.routes';
import analyticsRoutes from './routes/analytics.routes';
import logRoutes from './routes/log.routes';
import superadminRoutes from './routes/superadmin.routes';
import subadminRoutes from './routes/subadmin.routes';
import tenantRoutes from './routes/tenant.routes';
import staffRoutes from './routes/staff.routes';
import userRoutes from './routes/user.routes';
import inviteRoutes from './routes/invite.routes';
import orgRoutes from './routes/org.routes';
import billingRoutes from './routes/billing.routes';
import audienceQuestionRoutes from './routes/audienceQuestion.routes';
import privacyRoutes from './routes/privacy.routes';
import legalRoutes from './routes/legal.routes';
import { stripeWebhook, razorpayWebhook } from './controllers/billing.controller';
import { initializeSocket } from './socket';
import { ensureSuperAdmin } from './utils/bootstrap';
import { allowedOrigins, corsOriginHandler } from './config/cors';
import { env, configWarnings } from './config/env';
import { apiLimiter } from './config/rateLimit';
import { expireOverdueSubscriptions } from './controllers/billing.controller';
import { attachSocketAdapter, closeRedis } from './config/redis';
import { responseBatcher } from './utils/responseBatcher';
import { slog } from './utils/slog';
import { report, alertingConfigured } from './utils/errorReporter';
import prisma from './config/prisma';

const app = express();

// Render and most PaaS providers terminate TLS at a proxy. Without this the
// client IP is the proxy's, which would make every rate limit global.
app.set('trust proxy', 1);

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: corsOriginHandler,
    methods: ['GET', 'POST'],
  },
});

// CORS first so that error and rate-limit responses are readable by the browser.
app.use(
  cors({
    origin: corsOriginHandler,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Participant-Token'],
  })
);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
// Stripe signs the raw bytes; parsing JSON first would break verification.
app.post('/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhook);
app.post('/billing/razorpay-webhook', express.raw({ type: 'application/json' }), razorpayWebhook);
app.use(express.json({ limit: '200kb' }));

/**
 * Liveness. Deliberately cheap and deliberately shallow — it answers "is this
 * process running", nothing more, and is safe for a monitor to hit every few
 * seconds without touching the database.
 */
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'OK', uptimeSeconds: Math.floor(process.uptime()) });
});

/**
 * Readiness. Answers "should traffic be sent here", which is a different
 * question and the one a load balancer needs.
 *
 * The shallow check above reported OK from a process whose database had gone
 * away, so an instance that could not serve a single request kept being sent
 * every request. This one actually asks.
 */
app.get('/health/ready', async (_req, res) => {
  const checks: Record<string, 'ok' | 'failed'> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (error) {
    checks.database = 'failed';
    report('health.database_unreachable', error);
  }

  const ready = Object.values(checks).every((value) => value === 'ok');

  res.status(ready ? 200 : 503).json({
    status: ready ? 'READY' : 'NOT_READY',
    checks,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

app.use(apiLimiter);

app.use('/auth', authRoutes);
app.use('/events', eventRoutes);
app.use('/questions', questionRoutes);
app.use('/participants', participantRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/logs', logRoutes);
app.use('/superadmin', superadminRoutes);
app.use('/subadmin', subadminRoutes);
app.use('/tenant', tenantRoutes);
app.use('/staff', staffRoutes);
app.use('/users', userRoutes);
app.use('/invites', inviteRoutes);
app.use('/org', orgRoutes);
app.use('/billing', billingRoutes);
app.use('/questions-from-audience', audienceQuestionRoutes);
app.use('/privacy', privacyRoutes);
app.use('/legal', legalRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Express 5 forwards rejected promises here, so async controller failures no
// longer hang the request.
app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
  // Was a bare console.error, which is invisible to anything aggregating logs
  // and reaches nobody. The path and method are what make a 500 findable.
  report('request.unhandled_error', error, { method: req.method, path: req.path });
  res.status(500).json({ message: 'Internal server error' });
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

const sweepSubscriptions = async () => {
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
