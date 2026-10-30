import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { envSchema } from '../src/config/env.js';
import { connectDb, withTransaction } from '../src/lib/db.js';
import { errorHandler, notFound, rejectUnsafeKeys, validate } from '../src/middleware/core.js';

const secrets = {
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  JWT_REFRESH_SECRET: 'y'.repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
};

beforeAll(() => connectDb(process.env.TEST_MONGODB_URI));
afterAll(() => mongoose.disconnect());

describe('env', () => {
  it('rejects the dev OTP in production (D14)', () => {
    const result = envSchema.safeParse({ ...secrets, NODE_ENV: 'production', OTP_DEV_MODE: 'true', REDIS_URL: 'redis://x' });
    expect(result.success).toBe(false);
  });
  it('requires Redis in production (D17)', () => {
    expect(envSchema.safeParse({ ...secrets, NODE_ENV: 'production' }).success).toBe(false);
  });
  it('allows development without Redis', () => {
    expect(envSchema.safeParse({ ...secrets, NODE_ENV: 'development' }).success).toBe(true);
  });
});

describe('http core', () => {
  const app = createApp();

  it('reports health and readiness', async () => {
    await request(app).get('/health').expect(200);
    const ready = await request(app).get('/ready').expect(200);
    expect(ready.body.data).toEqual({ mongo: true, redis: true });
  });

  it('wraps unknown routes in the error envelope', async () => {
    const res = await request(app).get('/api/v1/nope').expect(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('returns VALIDATION_ERROR with field details', async () => {
    const mini = express();
    mini.use(express.json());
    mini.post('/x', validate({ body: z.object({ n: z.number() }) }), (_req, res) => void res.json({}));
    mini.use(notFound);
    mini.use(errorHandler);
    const res = await request(mini).post('/x').send({ n: 'a' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fieldErrors.n).toBeDefined();
  });

  it('rejects mongo operators in bodies', async () => {
    const mini = express();
    mini.use(express.json(), rejectUnsafeKeys);
    mini.post('/x', (_req, res) => void res.json({}));
    mini.use(errorHandler);
    await request(mini).post('/x').send({ phone: { $gt: '' } }).expect(400);
  });
});

describe('withTransaction', () => {
  it('rolls back on failure', async () => {
    const Thing = mongoose.model('Thing', new mongoose.Schema({ n: Number }));
    await Thing.createCollection();
    await expect(
      withTransaction(async (session) => {
        await Thing.create([{ n: 1 }], { session });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await Thing.countDocuments()).toBe(0);
  });
});
