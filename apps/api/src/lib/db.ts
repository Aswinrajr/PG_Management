import mongoose, { type ClientSession } from 'mongoose';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let replicaSet = false;

export async function connectDb(uri: string = env.MONGODB_URI) {
  await mongoose.connect(uri);
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  replicaSet = Boolean(hello.setName);
  if (!replicaSet) {
    if (env.NODE_ENV === 'production') throw new Error('MongoDB must be a replica set in production (D5)');
    logger.warn('MongoDB is standalone: transactions are disabled (D5)');
  }
}

/** Runs multi-document writes atomically. `session` is undefined on a standalone dev server. */
export async function withTransaction<T>(fn: (session: ClientSession | undefined) => Promise<T>): Promise<T> {
  if (!replicaSet) return fn(undefined);
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => fn(session));
  } finally {
    await session.endSession();
  }
}

export const dbReady = () => mongoose.connection.readyState === 1;
