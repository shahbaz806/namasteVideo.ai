import { ObjectId } from 'mongodb';
import { getDb } from '../client';
import { COLLECTIONS, AssetDocument, AssetKind, AssetState, AssetMetadata } from '../schema';

export interface CreateAssetInput {
  ownerId: string;
  projectId: string;
  kind: AssetKind;
  originVideoId?: string;
  originJobId: string;
  objectKey: string;
  contentType: string;
  producerFingerprint: string;
  metadata?: AssetMetadata;
}

export async function createAsset(input: CreateAssetInput): Promise<AssetDocument> {
  const db = await getDb();
  const now = new Date();

  const doc: AssetDocument = {
    _id: new ObjectId().toString(),
    schemaVersion: 1,
    ownerId: input.ownerId,
    projectId: input.projectId,
    kind: input.kind,
    originVideoId: input.originVideoId,
    originJobId: input.originJobId,
    objectKey: input.objectKey,
    state: 'staging',
    contentType: input.contentType,
    producerFingerprint: input.producerFingerprint,
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection<AssetDocument>(COLLECTIONS.ASSETS).insertOne(doc as any);
  return doc;
}

export async function getAssetById(id: string): Promise<AssetDocument | null> {
  const db = await getDb();
  return db.collection<AssetDocument>(COLLECTIONS.ASSETS).findOne({ _id: id });
}

export async function getAssetByObjectKey(objectKey: string): Promise<AssetDocument | null> {
  const db = await getDb();
  return db.collection<AssetDocument>(COLLECTIONS.ASSETS).findOne({ objectKey });
}

export async function markAssetReady(
  id: string,
  verification: { sha256: string; bytes: number }
): Promise<AssetDocument | null> {
  const db = await getDb();
  const now = new Date();

  const res = await db.collection<AssetDocument>(COLLECTIONS.ASSETS).findOneAndUpdate(
    { _id: id, state: 'staging' },
    {
      $set: {
        state: 'ready',
        sha256: verification.sha256,
        bytes: verification.bytes,
        readyAt: now,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' }
  );

  return res;
}

export async function listProjectAssets(
  ownerId: string,
  projectId: string
): Promise<AssetDocument[]> {
  const db = await getDb();
  return db
    .collection<AssetDocument>(COLLECTIONS.ASSETS)
    .find({ ownerId, projectId, state: { $ne: 'deleted' } })
    .toArray();
}

export async function markAssetDeleted(ownerId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.collection<AssetDocument>(COLLECTIONS.ASSETS).updateOne(
    { _id: id, ownerId },
    {
      $set: {
        state: 'deleted',
        updatedAt: new Date(),
      },
    }
  );
  return res.modifiedCount > 0;
}
