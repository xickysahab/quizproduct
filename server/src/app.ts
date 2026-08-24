import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
import { corsOriginHandler } from './config/cors';
import { apiLimiter } from './config/rateLimit';
import { report } from './utils/errorReporter';
import prisma from './config/prisma';

/**
 * The Express application, built without being started.
 *
 * Split out of index.ts so that tests can drive the real routing, middleware
 * and auth stack over HTTP instead of calling controllers directly. Importing
 * index.ts to get at the app would bind a port, attach socket handlers and
 * start an hourly timer — which is why, until now, nothing above the unit
 * level was tested at all.
 */
export const createApp = () => {
  const app = express();

  // Render and most PaaS providers terminate TLS at a proxy. Without this the
  // client IP is the proxy's, which would make every rate limit global.
  app.set('trust proxy', 1);

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
      /**
       * This server returns JSON and nothing else — no HTML, no scripts, no
       * styles. So the policy can be the strictest one there is: nothing may
       * load from anywhere, and nothing may frame it.
       *
       * It was switched off entirely, which is the setting you reach for when
       * a policy written for a web app keeps breaking an API. The right answer
       * for an API is not "no policy" but "deny everything", which costs
       * nothing here and removes this origin as a place to host or frame
       * anything.
       */
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'none'"],
          'form-action': ["'none'"],
        },
      },
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

  return app;
};

export default createApp;
