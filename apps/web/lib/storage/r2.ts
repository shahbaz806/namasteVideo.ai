import crypto from 'crypto';

export interface StorageObject {
  data: Buffer;
  contentType: string;
  bytes: number;
  sha256: string;
}

export interface StorageAdapter {
  putObject(key: string, data: Buffer, contentType: string): Promise<{ bytes: number; sha256: string }>;
  getObject(key: string): Promise<StorageObject | null>;
  deleteObject(key: string): Promise<boolean>;
  headObject(key: string): Promise<{ bytes: number; contentType: string; sha256: string } | null>;
}

// In-memory / Mock storage map for local development, tests, or when Cloudflare R2 is unset
const memoryStore = new Map<string, StorageObject>();

/**
 * Validates that an object key follows the approved hierarchical pattern:
 * `owners/{ownerId}/projects/{projectId}/videos/{videoId}/attempts/{attemptId}/{assetId}.{ext}`
 * Rejects path traversal (e.g. `..`), double slashes, and characters outside safe identifier set.
 */
export function validateObjectKey(key: string): boolean {
  if (!key || typeof key !== 'string' || key.length > 1024) {
    return false;
  }
  // Prevent path traversal
  if (key.includes('..') || key.includes('//') || key.startsWith('/') || key.includes('\\')) {
    return false;
  }
  // Check strict pattern: owners/<ownerId>/projects/<projectId>/videos/<videoId>/attempts/<attemptId>/<filename>
  const parts = key.split('/');
  if (parts.length !== 9) {
    return false;
  }
  const [ownersPrefix, ownerId, projectsPrefix, projectId, videosPrefix, videoId, attemptsPrefix, attemptId, filename] = parts;
  if (
    ownersPrefix !== 'owners' ||
    projectsPrefix !== 'projects' ||
    videosPrefix !== 'videos' ||
    attemptsPrefix !== 'attempts'
  ) {
    return false;
  }

  // Segment validation: safe characters only
  const safeIdRegex = /^[a-zA-Z0-9_-]+$/;
  if (
    !safeIdRegex.test(ownerId) ||
    !safeIdRegex.test(projectId) ||
    !safeIdRegex.test(videoId) ||
    !safeIdRegex.test(attemptId)
  ) {
    return false;
  }

  // Filename validation: <assetId>.<ext>
  const filenameRegex = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]{2,5}$/;
  if (!filenameRegex.test(filename)) {
    return false;
  }

  return true;
}

/**
 * Generates an immutable, deterministic attempt-scoped object key.
 */
export function generateObjectKey(params: {
  ownerId: string;
  projectId: string;
  videoId: string;
  attemptId: string;
  assetId: string;
  extension: string;
}): string {
  const ext = params.extension.replace(/^\./, '').toLowerCase();
  const key = `owners/${params.ownerId}/projects/${params.projectId}/videos/${params.videoId}/attempts/${params.attemptId}/${params.assetId}.${ext}`;
  if (!validateObjectKey(key)) {
    throw new Error(`Generated invalid object key: ${key}`);
  }
  return key;
}

export function computeSha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export class MemoryStorageAdapter implements StorageAdapter {
  async putObject(key: string, data: Buffer, contentType: string): Promise<{ bytes: number; sha256: string }> {
    if (!validateObjectKey(key)) {
      throw new Error(`Invalid object key rejected for security: ${key}`);
    }
    const bytes = data.length;
    const sha256 = computeSha256(data);
    memoryStore.set(key, {
      data,
      contentType,
      bytes,
      sha256,
    });
    return { bytes, sha256 };
  }

  async getObject(key: string): Promise<StorageObject | null> {
    if (!validateObjectKey(key)) {
      return null;
    }
    const item = memoryStore.get(key);
    if (!item) {
      return null;
    }
    return {
      data: Buffer.from(item.data),
      contentType: item.contentType,
      bytes: item.bytes,
      sha256: item.sha256,
    };
  }

  async deleteObject(key: string): Promise<boolean> {
    if (!validateObjectKey(key)) {
      return false;
    }
    // Idempotent: returns true even if not found (matching S3/R2 delete semantics)
    memoryStore.delete(key);
    return true;
  }

  async headObject(key: string): Promise<{ bytes: number; contentType: string; sha256: string } | null> {
    if (!validateObjectKey(key)) {
      return null;
    }
    const item = memoryStore.get(key);
    if (!item) {
      return null;
    }
    return {
      bytes: item.bytes,
      contentType: item.contentType,
      sha256: item.sha256,
    };
  }

  clear(): void {
    memoryStore.clear();
  }
}

// Global default storage adapter (can be swapped or extended for S3/R2 SDK)
export const storageAdapter: StorageAdapter = new MemoryStorageAdapter();
