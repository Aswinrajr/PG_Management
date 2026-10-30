import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDb } from './lib/db.js';
import { logger } from './lib/logger.js';
import { ensurePlans } from './modules/orgs/plans.js';

await connectDb();
await ensurePlans();
createApp().listen(env.PORT, () => logger.info(`API on http://localhost:${env.PORT}`));
