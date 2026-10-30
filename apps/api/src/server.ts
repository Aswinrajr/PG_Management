import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDb } from './lib/db.js';
import { logger } from './lib/logger.js';
import { initRealtime } from './lib/realtime.js';
import { machineTick } from './modules/community/laundry.js';
import { ensurePlans } from './modules/orgs/plans.js';

const TICK_MS = 60_000;

await connectDb();
await ensurePlans();
const server = createServer(createApp());
initRealtime(server);
server.listen(env.PORT, () => logger.info(`API on http://localhost:${env.PORT}`));
setInterval(() => void machineTick().catch((err) => logger.error({ err }, 'machine tick failed')), TICK_MS);
