import { z } from 'zod';

const flag = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(4000),
    APP_URL: z.string().url().default('http://localhost:5173'),
    MONGODB_URI: z.string().default('mongodb://localhost:27017/roomora'),
    REDIS_URL: z.string().optional().transform((v) => v || undefined),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),
    ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64'),
    OTP_DEV_MODE: flag,
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    RESEND_API_KEY: z.string().optional().transform((v) => v || undefined),
    MAIL_FROM: z.string().default('Roomora <no-reply@roomora.in>'),
    VAPID_PUBLIC_KEY: z.string().optional().transform((v) => v || undefined),
    VAPID_PRIVATE_KEY: z.string().optional().transform((v) => v || undefined),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.OTP_DEV_MODE) ctx.addIssue({ code: 'custom', path: ['OTP_DEV_MODE'], message: 'must be false in production (D14)' });
    if (!env.REDIS_URL) ctx.addIssue({ code: 'custom', path: ['REDIS_URL'], message: 'required in production (D17)' });
  });

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
