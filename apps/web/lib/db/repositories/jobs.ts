import crypto from 'node:crypto';
import { getDb } from '../client';
import {
  COLLECTIONS,
  ProjectDocument,
  DraftDocument,
  JobDocument,
  CommandDocument,
} from '../schema';
import { AcceptedOperation } from '../../api';

export interface IdeaSuggestion {
  id: string;
  topic: string;
  angle: string;
  takeaway: string;
}

export interface JobView {
  id: string;
  projectId: string;
  type: string;
  state: string;
  stage: string;
  revision: number;
  attempt: number;
  progress: {
    completedScenes: number | null;
    totalScenes: number | null;
    renderPercent: number | null;
  };
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  inputRequest: Record<string, unknown> | null;
  actions: { cancel: boolean; retry: boolean; regenerate: boolean };
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export function toJobView(doc: JobDocument): JobView {
  return {
    id: doc._id,
    projectId: doc.projectId,
    type: doc.type,
    state: doc.state,
    stage: doc.stage,
    revision: doc.revision,
    attempt: doc.attempt,
    progress: {
      completedScenes: doc.progress?.completedScenes ?? null,
      totalScenes: doc.progress?.totalScenes ?? null,
      renderPercent: doc.progress?.renderPercent ?? null,
    },
    result: doc.result ?? null,
    error: doc.error ?? null,
    inputRequest: doc.inputRequest ?? null,
    actions: {
      cancel: Boolean(doc.actions?.cancel),
      retry: Boolean(doc.actions?.retry),
      regenerate: Boolean(doc.actions?.regenerate),
    },
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : new Date(doc.createdAt).toISOString(),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : new Date(doc.updatedAt).toISOString(),
    finishedAt: doc.finishedAt ? (doc.finishedAt instanceof Date ? doc.finishedAt.toISOString() : new Date(doc.finishedAt).toISOString()) : null,
  };
}

export async function getJob(ownerId: string, jobId: string): Promise<JobView | null> {
  const db = await getDb();
  const job = await db.collection<JobDocument>(COLLECTIONS.JOBS).findOne({
    _id: jobId,
    ownerId,
  });
  if (!job) return null;
  return toJobView(job);
}

function generateFallbackSuggestions(prompt: string): IdeaSuggestion[] {
  const p = prompt.trim();
  const base = p.length > 0 ? p : 'Educational Topic';
  return [
    {
      id: `idea_${crypto.randomBytes(4).toString('hex')}`,
      topic: `${base}: The Core Mental Model`,
      angle: 'Intuitive first-principles visual analogy breaking down the hardest concept',
      takeaway: 'Viewers understand the foundational mechanism in under 60 seconds without jargon',
    },
    {
      id: `idea_${crypto.randomBytes(4).toString('hex')}`,
      topic: `Why Most Explanations of ${base} Get It Backwards`,
      angle: 'Addressing the #1 common misconception with a side-by-side visual comparison',
      takeaway: 'Viewers correct a widespread error and remember the distinction permanently',
    },
    {
      id: `idea_${crypto.randomBytes(4).toString('hex')}`,
      topic: `${base} in Action: Step-by-Step Walkthrough`,
      angle: 'A concrete numbered visual trace showing input becoming output',
      takeaway: 'Viewers can trace through the process themselves step by step',
    },
    {
      id: `idea_${crypto.randomBytes(4).toString('hex')}`,
      topic: `How Engineers Actually Use ${base} in Practice`,
      angle: 'Real-world high-impact engineering scenario with performance trade-offs',
      takeaway: 'Viewers connect textbook theory to practical production engineering decisions',
    },
  ];
}

async function fetchGeminiSuggestions(prompt: string): Promise<IdeaSuggestion[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'placeholder' || apiKey.includes('test')) {
    return generateFallbackSuggestions(prompt);
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const system = 'You are an educational video strategist creating concise explainer video concepts. Output JSON only matching the schema: {"suggestions":[{"id":"string","topic":"string","angle":"string","takeaway":"string"}]}. Provide 3 to 4 distinct angles.';
  const payload = {
    model,
    contents: [
      {
        parts: [
          { text: `Brainstorm 3-4 video ideas for a 60-90 second vertical explainer video on: "${prompt}". Each idea must have topic (under 60 chars), angle (under 120 chars), and takeaway (under 120 chars).` },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
    },
  };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      return generateFallbackSuggestions(prompt);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return generateFallbackSuggestions(prompt);

    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.suggestions) && parsed.suggestions.length >= 1) {
      return parsed.suggestions.slice(0, 5).map((s: Record<string, unknown>, idx: number) => ({
        id: typeof s.id === 'string' && s.id ? s.id : `idea_${idx + 1}`,
        topic: String(s.topic || 'Untitled Idea').slice(0, 100),
        angle: String(s.angle || 'Visual breakdown').slice(0, 200),
        takeaway: String(s.takeaway || 'Core understanding').slice(0, 200),
      }));
    }
    return generateFallbackSuggestions(prompt);
  } catch {
    return generateFallbackSuggestions(prompt);
  }
}

export async function createBrainstormJob(params: {
  ownerId: string;
  projectId: string;
  prompt: string;
  expectedDraftRevision: number;
  idempotencyKey: string;
  requestHash: string;
}): Promise<
  | { success: true; replayed: boolean; operation: AcceptedOperation; job: JobView }
  | {
      success: false;
      error: 'NOT_FOUND' | 'REVISION_CONFLICT' | 'PROJECT_BUSY' | 'IDEMPOTENCY_KEY_REUSED' | 'VALIDATION_FAILED';
      message: string;
      activeJobId?: string;
      currentRevision?: number;
    }
> {
  const { ownerId, projectId, prompt, expectedDraftRevision, idempotencyKey, requestHash } = params;
  const db = await getDb();
  const scope = `${ownerId}:POST:/api/projects/${projectId}/brainstorm`;

  // 1. Check idempotency receipt
  const existingCommand = await db.collection<CommandDocument>(COLLECTIONS.COMMANDS).findOne({
    ownerId,
    scope,
    idempotencyKey,
  });

  if (existingCommand) {
    if (existingCommand.requestHash === requestHash) {
      const operation = existingCommand.responseBody.data as AcceptedOperation;
      const job = await getJob(ownerId, operation.jobId);
      return {
        success: true,
        replayed: true,
        operation,
        job: job!,
      };
    }
    return {
      success: false,
      error: 'IDEMPOTENCY_KEY_REUSED',
      message: 'This Idempotency-Key was already used for a different request.',
    };
  }

  // 2. Verify project exists, not deleted, owned by user
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

  // 3. Check for active pipeline slot
  if (project.activeJobId) {
    const activeJob = await db.collection<JobDocument>(COLLECTIONS.JOBS).findOne({
      _id: project.activeJobId,
      ownerId,
    });
    if (activeJob && ['queued', 'running'].includes(activeJob.state)) {
      return {
        success: false,
        error: 'PROJECT_BUSY',
        message: 'A pipeline job is already active for this project.',
        activeJobId: project.activeJobId,
      };
    }
  }

  // 4. Verify draft exists and check expectedDraftRevision (CAS)
  const draft = await db.collection<DraftDocument>(COLLECTIONS.DRAFTS).findOne({
    projectId,
    ownerId,
  });

  if (!draft) {
    return {
      success: false,
      error: 'NOT_FOUND',
      message: 'Draft not found.',
    };
  }

  if (draft.revision !== expectedDraftRevision) {
    return {
      success: false,
      error: 'REVISION_CONFLICT',
      message: 'Draft revision conflict. Reload before brainstorming.',
      currentRevision: draft.revision,
    };
  }

  // 5. Generate suggestions (via Gemini or fallback)
  const suggestions = await fetchGeminiSuggestions(prompt);

  const jobId = `job_${crypto.randomBytes(16).toString('hex')}`;
  const now = new Date();

  const jobDoc: JobDocument = {
    _id: jobId,
    schemaVersion: 1,
    projectId,
    ownerId,
    type: 'brainstorm',
    state: 'succeeded',
    stage: 'finalize',
    revision: 1,
    attempt: 1,
    progress: {
      completedScenes: null,
      totalScenes: null,
      renderPercent: null,
    },
    result: {
      kind: 'ideas',
      suggestions,
    },
    error: null,
    inputRequest: { prompt },
    actions: { cancel: false, retry: false, regenerate: false },
    createdAt: now,
    updatedAt: now,
    finishedAt: now,
  };

  const acceptedOperation: AcceptedOperation = {
    jobId,
    resource: { kind: 'ideas', id: projectId },
    state: 'succeeded',
    statusUrl: `/api/jobs/${jobId}`,
  };

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
    resourceIds: [jobId, projectId],
    createdAt: now,
    updatedAt: now,
  };

  // 6. Save job and command receipt
  await db.collection<JobDocument>(COLLECTIONS.JOBS).insertOne(jobDoc);
  await db.collection<CommandDocument>(COLLECTIONS.COMMANDS).insertOne(commandDoc);

  return {
    success: true,
    replayed: false,
    operation: acceptedOperation,
    job: toJobView(jobDoc),
  };
}

// -------------------------------
// Storyboard generation job helper
// -------------------------------
import type { StoryboardFrame } from '../schemas/storyboard';

/**
 * Generate fallback storyboard frames when Gemini API is unavailable.
 * Returns a simple sequence of placeholder frames for the given prompt.
 */
function generateFallbackStoryboard(prompt: string): StoryboardFrame[] {
  const base = prompt.trim() || 'Storyboard';
  // Create 3 generic frames with placeholder images and captions
  return Array.from({ length: 3 }, (_, i) => ({
    _id: new (require('mongodb').ObjectId)(),
    imageUrl: `https://placehold.co/400x300?text=${encodeURIComponent(base)}+Frame+${i + 1}`,
    caption: `${base} – Step ${i + 1}`,
    order: i,
  }));
}

/**
 * Calls Gemini (or fallback) to generate storyboard frames for a project.
 * Stores the result as a job of type "storyboard" and returns the accepted operation.
 */
export async function createStoryboardJob(params: {
  ownerId: string;
  projectId: string;
  prompt: string;
  expectedDraftRevision: number;
  idempotencyKey: string;
  requestHash: string;
}): Promise<
  | { success: true; replayed: boolean; operation: AcceptedOperation; job: JobView }
  | { success: false; error: string; message: string; activeJobId?: string; currentRevision?: number }
> {
  const { ownerId, projectId, prompt, expectedDraftRevision, idempotencyKey, requestHash } = params;
  const db = await getDb();
  const scope = `${ownerId}:POST:/api/projects/${projectId}/storyboard`;

  // Idempotency check – reuse existing command if request matches
  const existing = await db.collection<CommandDocument>(COLLECTIONS.COMMANDS).findOne({
    ownerId,
    scope,
    idempotencyKey,
  });
  if (existing) {
    if (existing.requestHash === requestHash) {
      const op = existing.responseBody.data as AcceptedOperation;
      const job = await getJob(ownerId, op.jobId);
      return { success: true, replayed: true, operation: op, job: job! };
    }
    return { success: false, error: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key used with different payload' };
  }

  // Validate project & draft revision (CAS)
  const project = await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).findOne({ _id: projectId, ownerId, deletedAt: null });
  if (!project) return { success: false, error: 'NOT_FOUND', message: 'Project not found' };

  if (project.activeJobId) {
    const active = await db.collection<JobDocument>(COLLECTIONS.JOBS).findOne({ _id: project.activeJobId, ownerId });
    if (active && ['queued', 'running'].includes(active.state)) {
      return { success: false, error: 'PROJECT_BUSY', message: 'Another job is already running', activeJobId: project.activeJobId };
    }
  }

  const draft = await db.collection<DraftDocument>(COLLECTIONS.DRAFTS).findOne({ projectId, ownerId });
  if (!draft) return { success: false, error: 'NOT_FOUND', message: 'Draft not found' };
  if (draft.revision !== expectedDraftRevision) {
    return { success: false, error: 'REVISION_CONFLICT', message: 'Draft revision out of sync', currentRevision: draft.revision };
  }

  // Generate storyboard frames – Gemini call (simplified for brevity)
  let frames: StoryboardFrame[];
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('test')) {
    frames = generateFallbackStoryboard(prompt);
  } else {
    // Minimal Gemini request – could be expanded later
    try {
      const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      const payload = {
        model,
        contents: [{ parts: [{ text: `Generate a storyboard (list of image URLs and captions) for: ${prompt}` }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
      };
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = JSON.parse(text || '[]');
        // Expect [{imageUrl:string, caption:string}] array
        frames = (Array.isArray(parsed) ? parsed : []).map((f: any, idx: number) => ({
          _id: new (require('mongodb').ObjectId)(),
          imageUrl: f.imageUrl || `https://placehold.co/400x300?text=Frame+${idx + 1}`,
          caption: f.caption || `Frame ${idx + 1}`,
          order: idx,
        }));
      } else {
        frames = generateFallbackStoryboard(prompt);
      }
    } catch {
      frames = generateFallbackStoryboard(prompt);
    }
  }

  const jobId = `job_${crypto.randomBytes(16).toString('hex')}`;
  const now = new Date();
  const jobDoc: JobDocument = {
    _id: jobId,
    schemaVersion: 1,
    projectId,
    ownerId,
    type: 'storyboard',
    state: 'succeeded',
    stage: 'finalize',
    revision: 1,
    attempt: 1,
    progress: { completedScenes: null, totalScenes: null, renderPercent: null },
    result: { kind: 'storyboard', frames },
    error: null,
    inputRequest: { prompt },
    actions: { cancel: false, retry: false, regenerate: false },
    createdAt: now,
    updatedAt: now,
    finishedAt: now,
  };

  const op: AcceptedOperation = { jobId, resource: { kind: 'storyboard', id: projectId }, state: 'succeeded', statusUrl: `/api/jobs/${jobId}` };

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
    responseBody: { data: op as unknown as Record<string, unknown> },
    resourceIds: [jobId, projectId],
    createdAt: now,
    updatedAt: now,
  };

  await db.collection<JobDocument>(COLLECTIONS.JOBS).insertOne(jobDoc);
  await db.collection<CommandDocument>(COLLECTIONS.COMMANDS).insertOne(commandDoc);

  return { success: true, replayed: false, operation: op, job: toJobView(jobDoc) };
}
