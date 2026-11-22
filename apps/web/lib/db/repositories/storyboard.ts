import { getDb } from '../client';
import { COLLECTIONS, ProjectDocument, ApprovalDocument } from '../schema';
import { StoryboardDocument, StoryboardFrame } from '../schemas/storyboard';
import { ObjectId } from 'mongodb';
import crypto from 'crypto';

function computeHash(content: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

/** Fetch the current/latest storyboard for a project */
export async function getStoryboard(projectId: string, ownerId?: string): Promise<StoryboardDocument | null> {
  const db = await getDb();
  const filter: any = { projectId };
  if (ownerId) filter.ownerId = ownerId;

  // Fetch the latest version
  const doc = await db
    .collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS)
    .find(filter)
    .sort({ version: -1, createdAt: -1 })
    .limit(1)
    .next();

  return doc;
}

/** Fetch a specific storyboard version by its ID */
export async function getStoryboardById(storyboardId: string, ownerId?: string): Promise<StoryboardDocument | null> {
  const db = await getDb();
  let queryId: any;
  try {
    queryId = new ObjectId(storyboardId);
  } catch {
    queryId = storyboardId;
  }

  const filter: any = { $or: [{ _id: queryId }, { _id: storyboardId }] };
  if (ownerId) filter.ownerId = ownerId;

  return await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).findOne(filter);
}

/** List all storyboard versions for a project */
export async function listStoryboardVersions(projectId: string, ownerId?: string): Promise<StoryboardDocument[]> {
  const db = await getDb();
  const filter: any = { projectId };
  if (ownerId) filter.ownerId = ownerId;

  return await db
    .collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS)
    .find(filter)
    .sort({ version: -1, createdAt: -1 })
    .toArray();
}

/** Create a new storyboard version (v1 or fresh) */
export async function createStoryboard(
  projectId: string,
  ownerId: string,
  frames: StoryboardFrame[] = [],
  changeSummary: string = 'Initial storyboard'
): Promise<StoryboardDocument> {
  const db = await getDb();
  const existing = await getStoryboard(projectId, ownerId);
  const version = existing ? (existing.version || 1) + 1 : 1;
  const parentId = existing ? String(existing._id) : null;

  const contentHash = computeHash(frames);
  const storyHash = computeHash({
    projectId,
    frames: frames.map((f) => ({ caption: f.caption, narrationText: f.narrationText, order: f.order })),
  });

  const doc: StoryboardDocument = {
    projectId,
    ownerId,
    version,
    parentId,
    state: 'review_ready',
    changeSummary,
    changedSceneIds: frames.map((f) => String(f._id || f.order)),
    contentHash,
    storyHash,
    approvalId: null,
    approvedAt: null,
    approvedBy: null,
    frames,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).insertOne(doc as any);
  return { ...doc, _id: result.insertedId };
}

/** Create a conversational revision of the storyboard */
export async function createStoryboardRevision(
  projectId: string,
  ownerId: string,
  instruction: string,
  sceneId?: string
): Promise<StoryboardDocument> {
  const current = await getStoryboard(projectId, ownerId);
  const currentFrames: StoryboardFrame[] = current?.frames ? JSON.parse(JSON.stringify(current.frames)) : [];

  // Apply conversational modification to frames
  const changedSceneIds: string[] = [];
  if (currentFrames.length === 0) {
    // Generate initial scenes if empty
    currentFrames.push(
      {
        _id: new ObjectId(),
        order: 0,
        imageUrl: `https://placehold.co/600x400/090909/e58c33?text=Scene+1`,
        caption: `Scene 1 - ${instruction}`,
        narrationText: `Introduction generated from instruction: ${instruction}`,
      },
      {
        _id: new ObjectId(),
        order: 1,
        imageUrl: `https://placehold.co/600x400/090909/e58c33?text=Scene+2`,
        caption: `Scene 2 - Key Concept`,
        narrationText: `Core insight and explanation.`,
      }
    );
    changedSceneIds.push(String(currentFrames[0]._id), String(currentFrames[1]._id));
  } else {
    // Modify existing frames according to instruction
    if (sceneId) {
      const targetFrame = currentFrames.find((f) => String(f._id) === sceneId);
      if (targetFrame) {
        targetFrame.caption = `${targetFrame.caption || 'Scene'} [Revised: ${instruction}]`;
        targetFrame.narrationText = `${targetFrame.narrationText || ''} (${instruction})`;
        changedSceneIds.push(String(targetFrame._id));
      }
    } else {
      // General modification across scenes
      currentFrames.forEach((frame) => {
        frame.caption = `${frame.caption || 'Scene'} (revised)`;
        changedSceneIds.push(String(frame._id));
      });
    }
  }

  const nextVersion = (current?.version || 1) + 1;
  const contentHash = computeHash(currentFrames);
  const storyHash = computeHash({
    projectId,
    instruction,
    frames: currentFrames.map((f) => ({ caption: f.caption, narrationText: f.narrationText, order: f.order })),
  });

  const revisionDoc: StoryboardDocument = {
    projectId,
    ownerId,
    version: nextVersion,
    parentId: current ? String(current._id) : null,
    state: 'review_ready',
    changeSummary: instruction,
    changedSceneIds,
    contentHash,
    storyHash,
    approvalId: null,
    approvedAt: null,
    approvedBy: null,
    frames: currentFrames,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const db = await getDb();
  const result = await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).insertOne(revisionDoc as any);
  return { ...revisionDoc, _id: result.insertedId };
}

/** Restore a previous storyboard version as a new working revision */
export async function restoreStoryboardVersion(
  projectId: string,
  ownerId: string,
  targetVersionId: string
): Promise<StoryboardDocument> {
  const target = await getStoryboardById(targetVersionId, ownerId);
  if (!target) {
    throw new Error('Target storyboard version not found');
  }

  const current = await getStoryboard(projectId, ownerId);
  const nextVersion = (current?.version || 1) + 1;

  const restoredFrames: StoryboardFrame[] = JSON.parse(JSON.stringify(target.frames || []));
  const contentHash = computeHash(restoredFrames);
  const storyHash = computeHash({
    projectId,
    restoredFrom: targetVersionId,
    frames: restoredFrames.map((f) => ({ caption: f.caption, narrationText: f.narrationText, order: f.order })),
  });

  const restoredDoc: StoryboardDocument = {
    projectId,
    ownerId,
    version: nextVersion,
    parentId: targetVersionId,
    state: 'review_ready',
    changeSummary: `Restored from version ${target.version || 1}`,
    changedSceneIds: restoredFrames.map((f) => String(f._id || f.order)),
    contentHash,
    storyHash,
    approvalId: null,
    approvedAt: null,
    approvedBy: null,
    frames: restoredFrames,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const db = await getDb();
  const result = await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).insertOne(restoredDoc as any);
  return { ...restoredDoc, _id: result.insertedId };
}

/** Approve a storyboard version creating an immutable approval record */
export async function approveStoryboard(
  projectId: string,
  ownerId: string,
  storyboardId?: string
): Promise<{ storyboard: StoryboardDocument; approval: ApprovalDocument }> {
  const storyboard = storyboardId
    ? await getStoryboardById(storyboardId, ownerId)
    : await getStoryboard(projectId, ownerId);

  if (!storyboard) {
    throw new Error('Storyboard not found for approval');
  }

  if (storyboard.state === 'approved' && storyboard.approvalId) {
    // Already approved; fetch and return existing approval
    const db = await getDb();
    const existingApproval = await db.collection<ApprovalDocument>(COLLECTIONS.APPROVALS).findOne({
      _id: storyboard.approvalId as any,
    });
    if (existingApproval) {
      return { storyboard, approval: existingApproval };
    }
  }

  const db = await getDb();
  const approvalId = new ObjectId().toHexString();
  const subjectHash = storyboard.storyHash || computeHash(storyboard.frames);

  const approvalDoc: ApprovalDocument = {
    _id: approvalId,
    schemaVersion: 1,
    projectId,
    ownerId,
    kind: 'story',
    subjectId: String(storyboard._id),
    subjectHash,
    approvedBy: ownerId,
    approvedAt: new Date(),
    reason: 'explicit',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection<ApprovalDocument>(COLLECTIONS.APPROVALS).insertOne(approvalDoc as any);

  let queryId: any;
  try {
    queryId = new ObjectId(String(storyboard._id));
  } catch {
    queryId = storyboard._id;
  }

  await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).updateOne(
    { $or: [{ _id: queryId }, { _id: String(storyboard._id) }] },
    {
      $set: {
        state: 'approved',
        approvalId,
        approvedAt: new Date(),
        approvedBy: ownerId,
        updatedAt: new Date(),
      },
    }
  );

  const updatedStoryboard = await getStoryboardById(String(storyboard._id), ownerId);
  return {
    storyboard: updatedStoryboard || { ...storyboard, state: 'approved', approvalId },
    approval: approvalDoc,
  };
}

/** Replace the entire storyboard frames */
export async function replaceStoryboard(projectId: string, ownerId: string, frames: StoryboardFrame[]) {
  const current = await getStoryboard(projectId, ownerId);
  if (current && current.state === 'approved') {
    throw new Error('Cannot directly modify an approved storyboard; create a revision instead.');
  }

  const db = await getDb();
  if (current) {
    await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).updateOne(
      { _id: current._id },
      { $set: { frames, updatedAt: new Date(), contentHash: computeHash(frames) } }
    );
    return await getStoryboardById(String(current._id), ownerId);
  }

  return await createStoryboard(projectId, ownerId, frames, 'Direct frame replacement');
}

/** Add a single frame */
export async function addStoryboardFrame(projectId: string, ownerId: string, frame: Omit<StoryboardFrame, '_id'>) {
  const current = await getStoryboard(projectId, ownerId);
  if (current && current.state === 'approved') {
    throw new Error('Cannot directly modify an approved storyboard; create a revision instead.');
  }

  const db = await getDb();
  const newFrame: StoryboardFrame = { ...frame, _id: new ObjectId() };

  if (current) {
    await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).updateOne(
      { _id: current._id },
      {
        $push: { frames: newFrame },
        $set: { updatedAt: new Date() },
      }
    );
    return await getStoryboardById(String(current._id), ownerId);
  }

  return await createStoryboard(projectId, ownerId, [newFrame], 'Added initial frame');
}

/** Remove a frame by its ObjectId */
export async function removeStoryboardFrame(projectId: string, ownerId: string, frameId: string) {
  const current = await getStoryboard(projectId, ownerId);
  if (current && current.state === 'approved') {
    throw new Error('Cannot directly modify an approved storyboard; create a revision instead.');
  }
  if (!current) throw new Error('Storyboard not found');

  const db = await getDb();
  let objId: any;
  try {
    objId = new ObjectId(frameId);
  } catch {
    objId = frameId;
  }

  await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).updateOne(
    { _id: current._id },
    {
      $pull: { frames: { $or: [{ _id: objId }, { _id: frameId }] } as any },
      $set: { updatedAt: new Date() },
    }
  );
  return await getStoryboardById(String(current._id), ownerId);
}

/** Reorder frames */
export async function reorderStoryboardFrames(projectId: string, ownerId: string, orderedIds: string[]) {
  const current = await getStoryboard(projectId, ownerId);
  if (current && current.state === 'approved') {
    throw new Error('Cannot directly modify an approved storyboard; create a revision instead.');
  }
  if (!current) return null;

  const frameMap = new Map<string, StoryboardFrame>(current.frames.map((f) => [String(f._id), f]));
  const reordered: StoryboardFrame[] = orderedIds.map((id, idx) => {
    const f = frameMap.get(id);
    if (!f) throw new Error(`Invalid frame id: ${id}`);
    return { ...f, order: idx };
  });

  const db = await getDb();
  await db.collection<StoryboardDocument>(COLLECTIONS.STORYBOARDS).updateOne(
    { _id: current._id },
    { $set: { frames: reordered, updatedAt: new Date() } }
  );
  return await getStoryboardById(String(current._id), ownerId);
}
