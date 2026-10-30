import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/** Small key-value surface used for OTPs, cache, rate limits and idempotency keys. */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  incr(key: string, ttlSec: number): Promise<number>;
  del(key: string): Promise<void>;
  ping(): Promise<boolean>;
}

/** Local development and tests only (D17). */
export class MemoryKV implements KV {
  private store = new Map<string, { value: string; expiresAt: number }>();

  private live(key: string) {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string) {
    return this.live(key)?.value ?? null;
  }
  async set(key: string, value: string, ttlSec: number) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }
  async incr(key: string, ttlSec: number) {
    const entry = this.live(key);
    const next = Number(entry?.value ?? 0) + 1;
    this.store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? Date.now() + ttlSec * 1000 });
    return next;
  }
  async del(key: string) {
    this.store.delete(key);
  }
  async ping() {
    return true;
  }
  clear() {
    this.store.clear();
  }
}

class RedisKV implements KV {
  constructor(private redis: Redis) {}

  get(key: string) {
    return this.redis.get(key);
  }
  async set(key: string, value: string, ttlSec: number) {
    await this.redis.set(key, value, 'EX', ttlSec);
  }
  async incr(key: string, ttlSec: number) {
    const next = await this.redis.incr(key);
    if (next === 1) await this.redis.expire(key, ttlSec);
    return next;
  }
  async del(key: string) {
    await this.redis.del(key);
  }
  async ping() {
    return (await this.redis.ping()) === 'PONG';
  }
}

export const kv: KV = env.REDIS_URL ? new RedisKV(new Redis(env.REDIS_URL)) : new MemoryKV();
