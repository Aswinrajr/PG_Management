import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

/** Uses an installed mongod on Windows, so tests work when the binary download is blocked. */
function findSystemMongod() {
  if (process.env.MONGOMS_SYSTEM_BINARY) return process.env.MONGOMS_SYSTEM_BINARY;
  const root = 'C:\\Program Files\\MongoDB\\Server';
  if (!existsSync(root)) return undefined;
  const version = readdirSync(root).sort().at(-1);
  return version ? join(root, version, 'bin', 'mongod.exe') : undefined;
}

// A replica set, so tests exercise real transactions (D5).
export default async function setup() {
  const systemBinary = findSystemMongod();
  process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
  const server = await MongoMemoryReplSet.create({ replSet: { count: 1 }, ...(systemBinary && { binary: { systemBinary } }) });
  process.env.TEST_MONGODB_URI = server.getUri('roomora_test');
  return () => server.stop();
}
