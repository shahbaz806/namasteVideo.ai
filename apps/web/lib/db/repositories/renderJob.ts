import { getDb } from '@/lib/db/client';
import { COLLECTIONS } from '@/lib/db/schema';
import { RenderJobDocument } from '@/lib/db/schemas/renderJob';
import { Types } from 'mongoose';

export async function createRenderJob(projectId: string) {
  const db = await getDb();
  const result = await db.collection<RenderJobDocument>(COLLECTIONS.RENDER_JOBS).insertOne({
    projectId: new Types.ObjectId(projectId),
    status: 'queued',
    voicePreset: 'male',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);
  return result.insertedId.toHexString();
}

export async function getRenderJob(jobId: string) {
  const db = await getDb();
  return db
    .collection<RenderJobDocument>(COLLECTIONS.RENDER_JOBS)
    .findOne({ _id: new Types.ObjectId(jobId) as any });
}

export async function updateRenderJob(jobId: string, updates: Partial<RenderJobDocument>) {
  const db = await getDb();
  await db
    .collection<RenderJobDocument>(COLLECTIONS.RENDER_JOBS)
    .updateOne({ _id: new Types.ObjectId(jobId) as any }, { $set: { ...updates, updatedAt: new Date() } });
}
