import { getDb } from '@/lib/db/client';
import { COLLECTIONS } from '@/lib/db/schema';
import { RenderJobDocument } from '@/lib/db/schemas/renderJob';
import { ObjectId } from 'mongodb';

export async function createRenderJob(projectId: string) {
  const db = await getDb();
  const projectObjId = ObjectId.isValid(projectId) ? new ObjectId(projectId) : projectId;
  const result = await db.collection<RenderJobDocument>(COLLECTIONS.RENDER_JOBS).insertOne({
    projectId: projectObjId as any,
    status: 'queued',
    voicePreset: 'male',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);
  return result.insertedId.toString();
}

export async function getRenderJob(jobId: string) {
  const db = await getDb();
  const filter: any = ObjectId.isValid(jobId)
    ? { $or: [{ _id: new ObjectId(jobId) }, { _id: jobId }] }
    : { _id: jobId };
  return db
    .collection<RenderJobDocument>(COLLECTIONS.RENDER_JOBS)
    .findOne(filter);
}

export async function updateRenderJob(jobId: string, updates: Partial<RenderJobDocument>) {
  const db = await getDb();
  const filter: any = ObjectId.isValid(jobId)
    ? { $or: [{ _id: new ObjectId(jobId) }, { _id: jobId }] }
    : { _id: jobId };
  await db
    .collection<RenderJobDocument>(COLLECTIONS.RENDER_JOBS)
    .updateOne(filter, { $set: { ...updates, updatedAt: new Date() } });
}

