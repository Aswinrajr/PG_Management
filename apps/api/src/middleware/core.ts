import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { z, type ZodType } from 'zod';
import { AppError } from '../lib/errors.js';
import { kv } from '../lib/kv.js';
import { logger } from '../lib/logger.js';

type Source = 'body' | 'query' | 'params';

/** Parsed values land on req.valid, because Express 5 makes req.query read-only. */
export const validate =
  (schemas: Partial<Record<Source, ZodType>>) => (req: Request, _res: Response, next: NextFunction) => {
    req.valid = req.valid ?? {};
    for (const [source, schema] of Object.entries(schemas) as [Source, ZodType][]) {
      const result = schema.safeParse(req[source]);
      if (!result.success) {
        throw new AppError('VALIDATION_ERROR', 'Please check the details and try again', 400, z.flattenError(result.error));
      }
      req.valid[source] = result.data;
    }
    next();
  };

/** Blocks operator injection: request bodies may never carry `$` or dotted keys. */
const hasUnsafeKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasUnsafeKey);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => k.startsWith('$') || k.includes('.') || hasUnsafeKey(v));
  }
  return false;
};

export const rejectUnsafeKeys = (req: Request, _res: Response, next: NextFunction) => {
  if (hasUnsafeKey(req.body)) throw new AppError('VALIDATION_ERROR', 'Invalid request', 400);
  next();
};

export const rateLimit =
  (name: string, limit: number, windowSec: number) => async (req: Request, _res: Response, next: NextFunction) => {
    const count = await kv.incr(`rl:${name}:${req.ip}`, windowSec);
    if (count > limit) throw new AppError('RATE_LIMITED', 'Too many requests. Please try again soon.', 429);
    next();
  };

export const requestId = (req: Request, res: Response, next: NextFunction) => {
  req.id = randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};

export const notFound = () => {
  throw new AppError('NOT_FOUND', 'Not found', 404);
};

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } });
    return;
  }
  if ((err as { code?: number }).code === 11000) {
    res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'This record already exists' } });
    return;
  }
  logger.error({ err, reqId: req.id }, 'unhandled error');
  res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Something went wrong' } });
};
