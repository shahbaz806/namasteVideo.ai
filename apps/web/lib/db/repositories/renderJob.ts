import { getDb } from '@/lib/db';
import { RENDER_JOBS } from '@/lib/db/schema';
import { RenderJobDocument } from '@/lib/db/schemas/renderJob';
import { Types } from 'mongoose';

export async function createRenderJob(projectId: string) {
  const db = await getDb();
  const result = await db.collection<RenderJobDocument>(RENDER_JOBS).insertOne({
    projectId: new Types.ObjectId(projectId),
    status: 'queued',
    voicePreset: 'male', // default voice preset
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return result.insertedId.toHexString();
}
  const db = await getDb();
  const result = await db.collection<RenderJobDocument>(RENDER_JOBS).insertOne({
    projectId: new Types.ObjectId(projectId),
    status: 'queued',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return result.insertedId.toHexString();
}

export async function getRenderJob(jobId: string) {
  const db = await getDb();
  return db
    .collection<RenderJobDocument>(RENDER_JOBS)
    .findOne({ _id: new Types.ObjectId(jobId) });
}

export async function updateRenderJob(jobId: string, updates: Partial<RenderJobDocument>) {
  const db = await getDb();
  await db
    .collection<RenderJobDocument>(RENDER_JOBS)
    .updateOne({ _id: new Types.ObjectId(jobId) }, { $set: { ...updates, updatedAt: new Date() } });
}
