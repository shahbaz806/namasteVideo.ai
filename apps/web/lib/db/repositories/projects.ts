import crypto from 'node:crypto';
import { getDb } from '../client';
import {
  COLLECTIONS,
  ProjectDocument,
  DraftDocument,
  ConversationDocument,
  PreferencesDocument,
  CommandDocument,
  JobDocument,
  VideoDocument,
} from '../schema';
import { encodeProjectCursor, decodeProjectCursor, AcceptedOperation } from '../../api';

export interface ProjectView {
  id: string;
  title: string;
  revision: number;
  draftRevision: number;
  conversationId: string;
  currentStoryboardId: string | null;
  latestReadyVideoId: string | null;
  selectedVideoId: string | null;
  activeJobId: string | null;
  flags: {
    drafts: boolean;
    ready: boolean;
    scheduled: boolean;
    published: boolean;
    needsAttention: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export function toProjectView(doc: ProjectDocument): ProjectView {
  return {
    id: doc._id,
    title: doc.title,
    revision: doc.revision,
    draftRevision: doc.draftRevision,
    conversationId: doc.conversationId,
    currentStoryboardId: doc.currentStoryboardId ?? null,
    latestReadyVideoId: doc.latestReadyVideoId ?? null,
    selectedVideoId: doc.selectedVideoId ?? null,
    activeJobId: doc.activeJobId ?? null,
    flags: {
      drafts: Boolean(doc.flags?.drafts),
      ready: Boolean(doc.flags?.ready),
      scheduled: Boolean(doc.flags?.scheduled),
      published: Boolean(doc.flags?.published),
      needsAttention: Boolean(doc.flags?.needsAttention),
    },
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : new Date(doc.createdAt).toISOString(),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : new Date(doc.updatedAt).toISOString(),
  };
}

export type ProjectFilter = 'all' | 'drafts' | 'ready' | 'scheduled' | 'published' | 'needs_attention';

export const VALID_PROJECT_FILTERS: readonly ProjectFilter[] = [
  'all',
  'drafts',
  'ready',
  'scheduled',
  'published',
  'needs_attention',
] as const;

// ---------------- Repository Functions ----------------

export async function createProject(params: {
  ownerId: string;
  title?: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<
  | { success: true; replayed: boolean; project: ProjectView }
  | { success: false; error: 'IDEMPOTENCY_KEY_REUSED' | 'VALIDATION_FAILED'; message: string }
> {
  const { ownerId, idempotencyKey, requestHash } = params;
  const db = await getDb();
  const scope = `${ownerId}:POST:/api/projects`;

  // 1. Check idempotency receipt
  const existingCommand = await db.collection<CommandDocument>(COLLECTIONS.COMMANDS).findOne({
    ownerId,
    scope,
    idempotencyKey,
  });

  if (existingCommand) {
    if (existingCommand.requestHash === requestHash) {
      return {
        success: true,
        replayed: true,
        project: existingCommand.responseBody.data as ProjectView,
      };
    }
    return {
      success: false,
      error: 'IDEMPOTENCY_KEY_REUSED',
      message: 'This Idempotency-Key was already used for a different request.',
    };
  }

  // 2. Validate title
  const rawTitle = params.title?.trim();
  const title = rawTitle && rawTitle.length > 0 ? rawTitle : 'Untitled video';
  if (title.length > 100) {
    return {
      success: false,
      error: 'VALIDATION_FAILED',
      message: 'Title must be between 1 and 100 characters.',
    };
  }

  // 3. Prepare IDs
  const projectId = `prj_${crypto.randomBytes(16).toString('hex')}`;
  const draftId = `drf_${crypto.randomBytes(16).toString('hex')}`;
  const conversationId = `cnv_${crypto.randomBytes(16).toString('hex')}`;
  const commandId = `cmd_${crypto.randomBytes(16).toString('hex')}`;
  const now = new Date();

  // 4. Read preferences for default voice
  const userPrefs = await db
    .collection<PreferencesDocument>(COLLECTIONS.PREFERENCES)
    .findOne({ ownerId });
  const defaultVoicePreset = userPrefs?.defaultVoicePreset || 'daniel-test';

  // 5. Construct domain documents
  const projectDoc: ProjectDocument = {
    _id: projectId,
    schemaVersion: 1,
    ownerId,
    title,
    revision: 1,
    draftRevision: 1,
    conversationId,
    deletedAt: null,
    flags: {
      drafts: true,
      ready: false,
      scheduled: false,
      published: false,
      needsAttention: false,
    },
    contentRevision: 1,
    createdAt: now,
    updatedAt: now,
  };

  const emptyHash = crypto.createHash('sha256').update('').digest('hex');
  const draftDoc: DraftDocument = {
    _id: draftId,
    schemaVersion: 1,
    projectId,
    ownerId,
    revision: 1,
    topic: '',
    audience: '',
    notes: '',
    voicePreset: defaultVoicePreset,
    editablePlan: null,
    planStale: false,
    contentHash: emptyHash,
    canonicalizationVersion: 1,
    validationIssues: [],
    createdAt: now,
    updatedAt: now,
  };

  const conversationDoc: ConversationDocument = {
    _id: conversationId,
    schemaVersion: 1,
    projectId,
    ownerId,
    kind: 'project',
    nextSequence: 1,
    createdAt: now,
    updatedAt: now,
  };

  const projectView = toProjectView(projectDoc);
  const commandDoc: CommandDocument = {
    _id: commandId,
    schemaVersion: 1,
    ownerId,
    projectId,
    scope,
    idempotencyKey,
    requestHash,
    state: 'accepted',
    responseStatus: 201,
    responseBody: {
      data: projectView as unknown as Record<string, unknown>,
    },
    resourceIds: [projectId],
    createdAt: now,
    updatedAt: now,
  };

  // 6. Insert documents
  await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).insertOne(projectDoc);
  await db.collection<DraftDocument>(COLLECTIONS.DRAFTS).insertOne(draftDoc);
  await db.collection<ConversationDocument>(COLLECTIONS.CONVERSATIONS).insertOne(conversationDoc);
  await db.collection<CommandDocument>(COLLECTIONS.COMMANDS).insertOne(commandDoc);

  return {
    success: true,
    replayed: false,
    project: projectView,
  };
}

export async function listProjects(params: {
  ownerId: string;
  limit?: number;
  cursor?: string;
  filter?: ProjectFilter;
}): Promise<
  | { success: true; projects: ProjectView[]; page: { nextCursor: string | null; hasMore: boolean } }
  | { success: false; error: 'INVALID_CURSOR' | 'VALIDATION_FAILED'; message: string }
> {
  const { ownerId } = params;
  const limit = Math.min(Math.max(params.limit || 20, 1), 50);
  const filter: ProjectFilter = params.filter || 'all';

  if (!VALID_PROJECT_FILTERS.includes(filter)) {
    return {
      success: false,
      error: 'VALIDATION_FAILED',
      message: `Invalid filter. Must be one of: ${VALID_PROJECT_FILTERS.join(', ')}`,
    };
  }

  const db = await getDb();
  const query: Record<string, unknown> = {
    ownerId,
    deletedAt: null,
  };

  if (filter === 'drafts') {
    query['flags.drafts'] = true;
  } else if (filter === 'ready') {
    query['flags.ready'] = true;
  } else if (filter === 'scheduled') {
    query['flags.scheduled'] = true;
  } else if (filter === 'published') {
    query['flags.published'] = true;
  } else if (filter === 'needs_attention') {
    query['flags.needsAttention'] = true;
  }

  // Handle cursor pagination
  if (params.cursor) {
    const decoded = decodeProjectCursor(params.cursor, ownerId, filter);
    if (!decoded) {
      return {
        success: false,
        error: 'INVALID_CURSOR',
        message: 'The provided pagination cursor is invalid or expired.',
      };
    }

    query.$or = [
      { updatedAt: { $lt: decoded.updatedAt } },
      { updatedAt: decoded.updatedAt, _id: { $lt: decoded.id } },
    ];
  }

  const docs = await db
    .collection<ProjectDocument>(COLLECTIONS.PROJECTS)
    .find(query)
    .sort({ updatedAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = docs.length > limit;
  const items = hasMore ? docs.slice(0, limit) : docs;
  const projectViews = items.map(toProjectView);

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1];
    nextCursor = encodeProjectCursor(ownerId, filter, lastItem.updatedAt, lastItem._id);
  }

  return {
    success: true,
    projects: projectViews,
    page: {
      nextCursor,
      hasMore,
    },
  };
}

export async function getProject(
  ownerId: string,
  projectId: string
): Promise<ProjectView | null> {
  const db = await getDb();
  const doc = await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).findOne({
    _id: projectId,
    ownerId,
    deletedAt: null,
  });

  if (!doc) return null;
  return toProjectView(doc);
}

export async function updateProject(params: {
  ownerId: string;
  projectId: string;
  expectedRevision: number;
  title?: string;
  selectedVideoId?: string;
}): Promise<
  | { success: true; project: ProjectView }
  | {
      success: false;
      error: 'NOT_FOUND' | 'REVISION_CONFLICT' | 'VIDEO_NOT_READY' | 'VALIDATION_FAILED';
      message: string;
      currentRevision?: number;
    }
> {
  const { ownerId, projectId, expectedRevision } = params;
  const db = await getDb();

  const updates: Partial<ProjectDocument> = {};

  if (params.title !== undefined) {
    const rawTitle = params.title.trim();
    if (rawTitle.length === 0 || rawTitle.length > 100) {
      return {
        success: false,
        error: 'VALIDATION_FAILED',
        message: 'Title must be between 1 and 100 characters.',
      };
    }
    updates.title = rawTitle;
  }

  if (params.selectedVideoId !== undefined) {
    const video = await db.collection<VideoDocument>(COLLECTIONS.VIDEOS).findOne({
      _id: params.selectedVideoId,
      ownerId,
      projectId,
      state: { $in: ['ready_for_review', 'approved'] },
    });
    if (!video) {
      return {
        success: false,
        error: 'VIDEO_NOT_READY',
        message: 'The selected video does not exist or is not ready for review.',
      };
    }
    updates.selectedVideoId = params.selectedVideoId;
  }

  if (Object.keys(updates).length === 0) {
    return {
      success: false,
      error: 'VALIDATION_FAILED',
      message: 'At least one field (title or selectedVideoId) must be provided to update.',
    };
  }

  const now = new Date();
  const result = await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).findOneAndUpdate(
    {
      _id: projectId,
      ownerId,
      revision: expectedRevision,
      deletedAt: null,
    },
    {
      $set: {
        ...updates,
        updatedAt: now,
      },
      $inc: {
        revision: 1,
        contentRevision: 1,
      },
    },
    { returnDocument: 'after' }
  );

  if (result) {
    return {
      success: true,
      project: toProjectView(result),
    };
  }

  // Determine why the CAS update failed
  const existing = await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).findOne({
    _id: projectId,
    ownerId,
  });

  if (!existing || existing.deletedAt !== null) {
    return {
      success: false,
      error: 'NOT_FOUND',
      message: 'Project not found.',
    };
  }

  return {
    success: false,
    error: 'REVISION_CONFLICT',
    message: 'This project changed in another session.',
    currentRevision: existing.revision,
  };
}

export async function softDeleteProject(params: {
  ownerId: string;
  projectId: string;
  expectedRevision: number;
  idempotencyKey: string;
  requestHash: string;
}): Promise<
  | { success: true; replayed: boolean; operation: AcceptedOperation }
  | {
      success: false;
      error: 'NOT_FOUND' | 'REVISION_CONFLICT' | 'IDEMPOTENCY_KEY_REUSED';
      message: string;
      currentRevision?: number;
    }
> {
  const { ownerId, projectId, expectedRevision, idempotencyKey, requestHash } = params;
  const db = await getDb();
  const scope = `${ownerId}:DELETE:/api/projects/${projectId}`;

  // 1. Check idempotency receipt
  const existingCommand = await db.collection<CommandDocument>(COLLECTIONS.COMMANDS).findOne({
    ownerId,
    scope,
    idempotencyKey,
  });

  if (existingCommand) {
    if (existingCommand.requestHash === requestHash) {
      return {
        success: true,
        replayed: true,
        operation: existingCommand.responseBody.data as AcceptedOperation,
      };
    }
    return {
      success: false,
      error: 'IDEMPOTENCY_KEY_REUSED',
      message: 'This Idempotency-Key was already used for a different request.',
    };
  }

  // 2. Check project state and revision
  const existing = await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).findOne({
    _id: projectId,
    ownerId,
  });

  if (!existing || existing.deletedAt !== null) {
    return {
      success: false,
      error: 'NOT_FOUND',
      message: 'Project not found.',
    };
  }

  if (existing.revision !== expectedRevision) {
    return {
      success: false,
      error: 'REVISION_CONFLICT',
      message: 'This project changed in another session.',
      currentRevision: existing.revision,
    };
  }

  const now = new Date();
  const jobId = `job_${crypto.randomBytes(16).toString('hex')}`;

  // 3. Perform soft delete and clear active job slot
  await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).updateOne(
    { _id: projectId, ownerId },
    {
      $set: {
        deletedAt: now,
        updatedAt: now,
      },
      $unset: {
        activeJobId: '',
      },
      $inc: {
        revision: 1,
        contentRevision: 1,
      },
    }
  );

  // 4. Create cleanup job
  const cleanupJob: JobDocument = {
    _id: jobId,
    schemaVersion: 1,
    projectId,
    ownerId,
    type: 'cleanup',
    state: 'queued',
    stage: 'cleanup',
    revision: 1,
    attempt: 1,
    progress: { completedScenes: null, totalScenes: null, renderPercent: null },
    result: null,
    error: null,
    inputRequest: null,
    actions: { cancel: false, retry: false, regenerate: false },
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };
  await db.collection<JobDocument>(COLLECTIONS.JOBS).insertOne(cleanupJob);

  const acceptedOperation: AcceptedOperation = {
    jobId,
    resource: { kind: 'project', id: projectId },
    state: 'queued',
    statusUrl: `/api/jobs/${jobId}`,
  };

  // 5. Insert command receipt
  const commandDoc: CommandDocument = {
    _id: `cmd_${crypto.randomBytes(16).toString('hex')}`,
    schemaVersion: 1,
    ownerId,
    projectId,
    scope,
    idempotencyKey,
    requestHash,
    state: 'accepted',
    responseStatus: 202,
    responseBody: {
      data: acceptedOperation as unknown as Record<string, unknown>,
    },
    resourceIds: [projectId, jobId],
    createdAt: now,
    updatedAt: now,
  };
  await db.collection<CommandDocument>(COLLECTIONS.COMMANDS).insertOne(commandDoc);

  return {
    success: true,
    replayed: false,
    operation: acceptedOperation,
  };
}
