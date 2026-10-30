import { Queue, Worker } from 'bullmq';
import { env } from './config/env.js';
import { applyLateFees, checkTrials, generateAllMonthly, purgeOldKyc, rentReminders } from './jobs/tasks.js';
import { connectDb } from './lib/db.js';
import { logger } from './lib/logger.js';

const TZ = 'Asia/Kolkata';
const JOBS = {
  generateMonthlyInvoices: { cron: '30 0 1 * *', run: generateAllMonthly },
  applyLateFees: { cron: '0 1 * * *', run: applyLateFees },
  rentReminders: { cron: '0 10 * * *', run: rentReminders },
  checkTrials: { cron: '0 2 * * *', run: checkTrials },
  purgeOldKyc: { cron: '0 3 * * *', run: purgeOldKyc },
} as const;

await connectDb();

if (!env.REDIS_URL) {
  logger.warn('No REDIS_URL: the scheduler is off. Run jobs by hand in development (D17).');
  process.exit(0);
}

const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null };
const queue = new Queue('roomora', { connection });
for (const [name, job] of Object.entries(JOBS)) {
  await queue.upsertJobScheduler(name, { pattern: job.cron, tz: TZ }, { name, opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } } });
}

new Worker(
  'roomora',
  async (job) => {
    const result = await JOBS[job.name as keyof typeof JOBS].run();
    logger.info({ job: job.name, result }, 'job finished');
  },
  { connection },
);
logger.info('worker started');
