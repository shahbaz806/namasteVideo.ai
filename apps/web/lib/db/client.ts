import { MongoClient, Db } from 'mongodb';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';

// Fix Node.js c-ares DNS SRV resolution issue on certain Windows network interfaces
if (process.platform === 'win32') {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch {
    // Ignore if not allowed in strict edge/restricted environments
  }
}

// Auto-load .env.local if running tests or scripts outside Next.js runtime
if (process.env.NODE_ENV !== 'production' && !process.env.MONGODB_URI) {
  const candidates = [
    path.resolve(process.cwd(), 'apps/web/.env.local'),
    path.resolve(process.cwd(), '.env.local'),
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ envPath)) {
      const content = fs.readFileSync(/*turbopackIgnore: true*/ envPath, 'utf8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line && !line.startsWith('#') && line.includes('=')) {
          const eqIdx = line.indexOf('=');
          const key = line.slice(0, eqIdx).trim();
          const val = line.slice(eqIdx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
      if (process.env.MONGODB_URI) break;
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export function getMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not configured. Please define MONGODB_URI in apps/web/.env.local'
    );
  }
  return uri;
}

export function getDbName(): string {
  return process.env.MONGODB_DB_NAME?.trim() || 'namastevideo_dev';
}

export function createMongoClient(uri: string): MongoClient {
  return new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
}

let _cachedClientPromise: Promise<MongoClient> | undefined;

export async function getMongoClient(): Promise<MongoClient> {
  const uri = getMongoUri();

  if (global._mongoClientPromise) {
    return global._mongoClientPromise;
  }
  if (_cachedClientPromise) {
    return _cachedClientPromise;
  }

  const client = createMongoClient(uri);
  const connectPromise = client.connect();

  if (process.env.NODE_ENV === 'development') {
    global._mongoClientPromise = connectPromise;
  } else {
    _cachedClientPromise = connectPromise;
  }

  return connectPromise;
}

export async function getDb(name?: string): Promise<Db> {
  const client = await getMongoClient();
  return client.db(name || getDbName());
}

export async function closeMongoClient(): Promise<void> {
  if (_cachedClientPromise) {
    const client = await _cachedClientPromise;
    await client.close();
    _cachedClientPromise = undefined;
  }
  if (global._mongoClientPromise) {
    const client = await global._mongoClientPromise;
    await client.close();
    global._mongoClientPromise = undefined;
  }
}
