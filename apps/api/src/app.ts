import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { dbReady } from './lib/db.js';
import { kv } from './lib/kv.js';
import { errorHandler, notFound, rateLimit, rejectUnsafeKeys, requestId } from './middleware/core.js';
import { authRoutes } from './modules/auth/routes.js';
import { orgCreateRoutes, tenantRouter } from './modules/orgs/routes.js';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(requestId, helmet(), cors({ origin: env.APP_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }), cookieParser(), rejectUnsafeKeys);

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.get('/ready', async (_req, res) => {
    const redis = await kv.ping().catch(() => false);
    const mongo = dbReady();
    res.status(mongo && redis ? 200 : 503).json({ success: mongo && redis, data: { mongo, redis } });
  });

  app.use('/api/v1', rateLimit('api', 600, 60));
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/orgs', orgCreateRoutes);
  app.use('/api/v1/org/:orgId', tenantRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
