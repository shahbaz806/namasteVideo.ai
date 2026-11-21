import { getDb } from '../client';
import { COLLECTIONS, ProjectDocument } from '../schema';
import { StoryboardDocument, StoryboardFrame } from '../schemas/storyboard';
import { ObjectId } from 'mongodb';

/** Fetch a storyboard for a given project */
export async function getStoryboard(projectId: string) {
  const db = await getDb();
  // Verify ownership via project lookup
  const project = await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).findOne({ _id: projectId, deletedAt: null });
  if (!project) return null;
  return await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).findOne({ projectId, ownerId: project.ownerId });
}

/** Create an empty storyboard for a project */
export async function createStoryboard(projectId: string, ownerId: string) {
  const db = await getDb();
  const doc: Partial<StoryboardDocument> = {
    projectId,
    ownerId,
    frames: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;
  const result = await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).insertOne(doc as any);
  return { ...doc, _id: result.insertedId } as StoryboardDocument;
}

/** Replace the entire storyboard frames (used by the generation job) */
export async function replaceStoryboard(projectId: string, ownerId: string, frames: StoryboardFrame[]) {
  const db = await getDb();
  await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).updateOne(
    { projectId, ownerId },
    { $set: { frames, updatedAt: new Date() } },
    { upsert: true },
  );
  return await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).findOne({ projectId, ownerId });
}

/** Add a single frame */
export async function addStoryboardFrame(projectId: string, frame: Omit<StoryboardFrame, '_id'>) {
  const db = await getDb();
  // Find project to get ownerId
  const project = await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).findOne({ _id: projectId, deletedAt: null });
  if (!project) throw new Error('Project not found');
  const newFrame: StoryboardFrame = { ...frame, _id: new ObjectId() } as any;
  await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).updateOne(
    { projectId, ownerId: project.ownerId },
    { $push: { frames: newFrame }, $set: { updatedAt: new Date() } },
    { upsert: true },
  );
  return await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).findOne({ projectId, ownerId: project.ownerId });
}

/** Remove a frame by its ObjectId */
export async function removeStoryboardFrame(projectId: string, frameId: string) {
  const db = await getDb();
  const project = await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).findOne({ _id: projectId, deletedAt: null });
  if (!project) throw new Error('Project not found');
  await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).updateOne(
    { projectId, ownerId: project.ownerId },
    { $pull: { frames: { _id: new ObjectId(frameId) } }, $set: { updatedAt: new Date() } },
  );
  return await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).findOne({ projectId, ownerId: project.ownerId });
}

/** Reorder frames – client supplies ordered array of frame IDs */
export async function reorderStoryboardFrames(projectId: string, orderedIds: string[]) {
  const db = await getDb();
  const project = await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).findOne({ _id: projectId, deletedAt: null });
  if (!project) throw new Error('Project not found');
  const doc = await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).findOne({ projectId, ownerId: project.ownerId });
  if (!doc) return null;
  const frameMap = new Map<string, StoryboardFrame>(doc.frames.map(f => [(f._id as any).toHexString(), f]));
  const reordered = orderedIds.map((id, idx) => {
    const f = frameMap.get(id);
    if (!f) throw new Error('Invalid frame id');
    return { ...f, order: idx } as StoryboardFrame;
  });
  await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).updateOne(
    { projectId, ownerId: project.ownerId },
    { $set: { frames: reordered, updatedAt: new Date() } },
  );
  return await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).findOne({ projectId, ownerId: project.ownerId });
}
