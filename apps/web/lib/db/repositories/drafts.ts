import crypto from 'node:crypto';
import { getDb } from '../client';
import {
  COLLECTIONS,
  ProjectDocument,
  DraftDocument,
} from '../schema';

export const VALID_VOICE_PRESETS = [
  'daniel-test',
  'indian-english-male',
  'indian-english-female',
] as const;

export type ValidVoicePreset = typeof VALID_VOICE_PRESETS[number];

export interface FieldIssue {
  path: string;
  code: string;
  message: string;
}

export interface DraftView {
  projectId: string;
  conversationId: string;
  revision: number;
  topic: string;
  audience: string;
  notes: string;
  voicePreset: string;
  editablePlan: Record<string, unknown> | null;
  sourceStoryboardId: string | null;
  contentHash: string;
  validation: {
    valid: boolean;
    issues: FieldIssue[];
  };
  updatedAt: string;
}

export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k])).join(',') + '}';
}

export function computeDraftHash(params: {
  topic: string;
  audience: string;
  notes: string;
  voicePreset: string;
  editablePlan: unknown | null;
}): string {
  const canonical = canonicalJson({
    audience: params.audience,
    canonicalizationVersion: 1,
    editablePlan: params.editablePlan,
    notes: params.notes,
    topic: params.topic,
    voicePreset: params.voicePreset,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function validateDraftFields(draft: {
  topic: string;
  audience: string;
  notes: string;
  voicePreset: string;
  editablePlan: Record<string, unknown> | null;
  planStale?: boolean;
}): FieldIssue[] {
  const issues: FieldIssue[] = [];

  if (!draft.topic || draft.topic.trim().length === 0) {
    issues.push({
      path: 'topic',
      code: 'REQUIRED',
      message: 'Topic is required to generate a video plan.',
    });
  } else if (draft.topic.length > 2000) {
    issues.push({
      path: 'topic',
      code: 'TOO_LONG',
      message: 'Topic must not exceed 2,000 characters.',
    });
  }

  if (draft.audience && draft.audience.length > 200) {
    issues.push({
      path: 'audience',
      code: 'TOO_LONG',
      message: 'Audience must not exceed 200 characters.',
    });
  }

  if (draft.notes && draft.notes.length > 20000) {
    issues.push({
      path: 'notes',
      code: 'TOO_LONG',
      message: 'Notes must not exceed 20,000 characters.',
    });
  }

  if (draft.planStale && draft.editablePlan !== null) {
    issues.push({
      path: 'editablePlan',
      code: 'PLAN_STALE',
      message: 'Working plan was created for earlier topic or voice settings and should be replanned.',
    });
  }

  return issues;
}

export function toDraftView(
  doc: DraftDocument,
  conversationId: string,
  issuesOverride?: FieldIssue[]
): DraftView {
  const issues = issuesOverride ?? validateDraftFields(doc);
  const isValid = issues.length === 0;

  return {
    projectId: doc.projectId,
    conversationId,
    revision: doc.revision,
    topic: doc.topic,
    audience: doc.audience,
    notes: doc.notes,
    voicePreset: doc.voicePreset,
    editablePlan: doc.editablePlan,
    sourceStoryboardId: doc.sourceStoryboardId ?? null,
    contentHash: doc.contentHash,
    validation: {
      valid: isValid,
      issues,
    },
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : new Date(doc.updatedAt).toISOString(),
  };
}

// ---------------- Repository Functions ----------------

export async function getDraft(
  ownerId: string,
  projectId: string
): Promise<DraftView | null> {
  const db = await getDb();

  // 1. Verify project exists, not deleted, belongs to owner
  const project = await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).findOne({
    _id: projectId,
    ownerId,
    deletedAt: null,
  });

  if (!project) return null;

  // 2. Fetch draft
  const draft = await db.collection<DraftDocument>(COLLECTIONS.DRAFTS).findOne({
    projectId,
    ownerId,
  });

  if (!draft) return null;

  return toDraftView(draft, project.conversationId);
}

export interface UpdateDraftChanges {
  topic?: string;
  audience?: string;
  notes?: string;
  voicePreset?: string;
  editablePlan?: Record<string, unknown> | null;
}

export async function updateDraft(params: {
  ownerId: string;
  projectId: string;
  expectedRevision: number;
  changes: UpdateDraftChanges;
}): Promise<
  | { success: true; draft: DraftView }
  | {
      success: false;
      error: 'NOT_FOUND' | 'REVISION_CONFLICT' | 'VOICE_UNAVAILABLE' | 'VALIDATION_FAILED';
      message: string;
      currentRevision?: number;
      reloadUrl?: string;
    }
> {
  const { ownerId, projectId, expectedRevision, changes } = params;
  const db = await getDb();

  // 1. Verify project exists and belongs to owner
  const project = await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).findOne({
    _id: projectId,
    ownerId,
    deletedAt: null,
  });

  if (!project) {
    return {
      success: false,
      error: 'NOT_FOUND',
      message: 'Project not found.',
    };
  }

  // 2. Check draft exists
  const existingDraft = await db.collection<DraftDocument>(COLLECTIONS.DRAFTS).findOne({
    projectId,
    ownerId,
  });

  if (!existingDraft) {
    return {
      success: false,
      error: 'NOT_FOUND',
      message: 'Draft not found.',
    };
  }

  // 3. CAS Check: revision must match expectedRevision
  if (existingDraft.revision !== expectedRevision) {
    return {
      success: false,
      error: 'REVISION_CONFLICT',
      message: 'This draft changed in another session.',
      currentRevision: existingDraft.revision,
      reloadUrl: `/api/projects/${projectId}/draft`,
    };
  }

  // 4. Validate voicePreset if changed
  if (changes.voicePreset !== undefined) {
    if (!VALID_VOICE_PRESETS.includes(changes.voicePreset as ValidVoicePreset)) {
      return {
        success: false,
        error: 'VOICE_UNAVAILABLE',
        message: `Voice preset "${changes.voicePreset}" is not available. Must be one of: ${VALID_VOICE_PRESETS.join(', ')}`,
      };
    }
  }

  // 5. Validate editablePlan consistency with voicePreset if whole plan is applied
  const resolvedVoice = changes.voicePreset !== undefined ? changes.voicePreset : existingDraft.voicePreset;
  if (changes.editablePlan && typeof changes.editablePlan === 'object') {
    const planVoice = (changes.editablePlan as Record<string, unknown>).voicePreset;
    if (planVoice && planVoice !== resolvedVoice) {
      return {
        success: false,
        error: 'VALIDATION_FAILED',
        message: `Plan voice preset "${planVoice}" does not match draft voice preset "${resolvedVoice}".`,
      };
    }
  }

  // 6. Compute updated field values
  const newTopic = changes.topic !== undefined ? changes.topic : existingDraft.topic;
  const newAudience = changes.audience !== undefined ? changes.audience : existingDraft.audience;
  const newNotes = changes.notes !== undefined ? changes.notes : existingDraft.notes;
  const newVoicePreset = changes.voicePreset !== undefined ? changes.voicePreset : existingDraft.voicePreset;
  const newEditablePlan = changes.editablePlan !== undefined ? changes.editablePlan : existingDraft.editablePlan;

  // 7. Check if plan becomes stale
  let planStale = existingDraft.planStale;
  const topicChanged = changes.topic !== undefined && changes.topic !== existingDraft.topic;
  const notesChanged = changes.notes !== undefined && changes.notes !== existingDraft.notes;
  const voiceChanged = changes.voicePreset !== undefined && changes.voicePreset !== existingDraft.voicePreset;

  if (changes.editablePlan !== undefined) {
    // Explicitly provided plan resets staleness
    planStale = false;
  } else if ((topicChanged || notesChanged || voiceChanged) && existingDraft.editablePlan !== null) {
    // Topic/notes/voice changed without supplying a new plan marks existing plan stale
    planStale = true;
  }

  // 8. Recompute validation issues & contentHash
  const validationIssues = validateDraftFields({
    topic: newTopic,
    audience: newAudience,
    notes: newNotes,
    voicePreset: newVoicePreset,
    editablePlan: newEditablePlan,
    planStale,
  });

  const contentHash = computeDraftHash({
    topic: newTopic,
    audience: newAudience,
    notes: newNotes,
    voicePreset: newVoicePreset,
    editablePlan: newEditablePlan,
  });

  const now = new Date();

  // 9. Atomic CAS update on draft collection
  const updateResult = await db.collection<DraftDocument>(COLLECTIONS.DRAFTS).findOneAndUpdate(
    {
      projectId,
      ownerId,
      revision: expectedRevision,
    },
    {
      $set: {
        topic: newTopic,
        audience: newAudience,
        notes: newNotes,
        voicePreset: newVoicePreset,
        editablePlan: newEditablePlan,
        planStale,
        contentHash,
        validationIssues: validationIssues.map(i => ({ path: i.path, message: i.message })),
        updatedAt: now,
      },
      $inc: {
        revision: 1,
      },
    },
    { returnDocument: 'after' }
  );

  if (!updateResult) {
    // Concurrent update happened
    const current = await db.collection<DraftDocument>(COLLECTIONS.DRAFTS).findOne({
      projectId,
      ownerId,
    });
    return {
      success: false,
      error: 'REVISION_CONFLICT',
      message: 'This draft changed in another session.',
      currentRevision: current?.revision ?? existingDraft.revision,
      reloadUrl: `/api/projects/${projectId}/draft`,
    };
  }

  // 10. Update parent project draftRevision and updatedAt
  await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).updateOne(
    { _id: projectId, ownerId },
    {
      $set: {
        draftRevision: updateResult.revision,
        updatedAt: now,
      },
    }
  );

  return {
    success: true,
    draft: toDraftView(updateResult, project.conversationId, validationIssues),
  };
}
