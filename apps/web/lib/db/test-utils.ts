import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getDb } from './client'; // will be overridden

// Increase memory server startup timeout for CI environments
process.env.MONGOMS_TIMEOUT_MS = '600000';

let mongod: MongoMemoryServer | null = null;
let client: MongoClient | null = null;

export async function connectTestDb() {
  mongod = await MongoMemoryServer.create({ binary: { skipMD5: true } as any });
  const uri = mongod.getUri();
  client = new MongoClient(uri);
  await client.connect();
  // Override getDb to return this client’s db
  (global as any).testDb = client.db();
}

export async function disconnectTestDb() {
  if (client) await client.close();
  if (mongod) await mongod.stop();
}

// Helper used by repo functions when running tests
export async function getTestDb() {
  if ((global as any).testDb) return (global as any).testDb;
  throw new Error('Test DB not initialized');
}
