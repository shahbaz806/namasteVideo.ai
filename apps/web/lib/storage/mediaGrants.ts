import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { getDb } from '../db/client';
import { COLLECTIONS, MediaGrantDocument, MediaGrantPurpose, AssetDocument, ProjectDocument } from '../db/schema';
import { getAssetById } from '../db/repositories/assets';

export interface CreateMediaGrantResult {
  grantId: string;
  token: string;
  url: string;
  expiresAt: Date;
  contentType: string;
  bytes?: number;
}

export function hashGrantToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createMediaGrant(params: {
  ownerId: string;
  projectId: string;
  assetId: string;
  purpose: MediaGrantPurpose;
  lifetimeSeconds?: number;
}): Promise<CreateMediaGrantResult> {
  const db = await getDb();

  // 1. Verify project exists and is not deleted (tombstone check)
  const project = await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).findOne({
    _id: params.projectId,
    ownerId: params.ownerId,
    deletedAt: null,
  });
  if (!project) {
    throw new Error('PROJECT_NOT_FOUND_OR_DELETED');
  }

  // 2. Verify asset exists, belongs to same project, and is ready
  const asset = await getAssetById(params.assetId);
  if (!asset || asset.ownerId !== params.ownerId || asset.projectId !== params.projectId) {
    throw new Error('ASSET_NOT_FOUND');
  }
  if (asset.state !== 'ready') {
    throw new Error('ASSET_NOT_READY');
  }

  // 3. Generate 256-bit random bearer token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashGrantToken(token);

  // 4. Expiry (default 10 minutes = 600s)
  const durationMs = (params.lifetimeSeconds ?? 600) * 1000;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMs);

  const grantDoc: MediaGrantDocument = {
    _id: new ObjectId().toString(),
    schemaVersion: 1,
    ownerId: params.ownerId,
    projectId: params.projectId,
    assetId: params.assetId,
    tokenHash,
    purpose: params.purpose,
    expiresAt,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection<MediaGrantDocument>(COLLECTIONS.MEDIA_GRANTS).insertOne(grantDoc as any);

  return {
    grantId: grantDoc._id,
    token,
    url: `/api/media/${token}`,
    expiresAt,
    contentType: asset.contentType,
    bytes: asset.bytes,
  };
}

export interface VerifiedGrant {
  grant: MediaGrantDocument;
  asset: AssetDocument;
}

export async function verifyMediaGrant(token: string): Promise<VerifiedGrant | null> {
  if (!token || typeof token !== 'string' || token.length < 32) {
    return null;
  }

  const db = await getDb();
  const tokenHash = hashGrantToken(token);
  const now = new Date();

  // Find grant
  const grant = await db.collection<MediaGrantDocument>(COLLECTIONS.MEDIA_GRANTS).findOne({
    tokenHash,
    revokedAt: null,
    expiresAt: { $gt: now },
  });

  if (!grant) {
    return null;
  }

  // Check project tombstone if project-scoped
  if (grant.projectId) {
    const project = await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).findOne({
      _id: grant.projectId,
      deletedAt: null,
    });
    if (!project) {
      return null;
    }
  }

  // Check asset readiness
  const asset = await getAssetById(grant.assetId);
  if (!asset || asset.state !== 'ready') {
    return null;
  }

  return { grant, asset };
}

export async function revokeMediaGrant(grantId: string, ownerId: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.collection<MediaGrantDocument>(COLLECTIONS.MEDIA_GRANTS).updateOne(
    { _id: grantId, ownerId, revokedAt: null },
    { $set: { revokedAt: new Date(), updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

export async function revokeProjectMediaGrants(projectId: string): Promise<number> {
  const db = await getDb();
  const res = await db.collection<MediaGrantDocument>(COLLECTIONS.MEDIA_GRANTS).updateMany(
    { projectId, revokedAt: null },
    { $set: { revokedAt: new Date(), updatedAt: new Date() } }
  );
  return res.modifiedCount;
}
