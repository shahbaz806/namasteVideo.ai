import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session-guard';
import { createSuccessResponse, createErrorResponse, createAcceptedResponse } from '@/lib/api';
import { getStoryboard, createStoryboard } from '@/lib/db/repositories/storyboard';
import { getProject } from '@/lib/db/repositories/projects';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET /api/projects/:id/storyboard – fetch current storyboard */
export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (auth.errorResponse) return auth.errorResponse;

  const { user, requestId } = auth;
  const { id: projectId } = await context.params;

  const project = await getProject(user.id, projectId);
  if (!project) {
    return createErrorResponse('NOT_FOUND', 'Project not found.', requestId, 404);
  }

  const storyboard = await getStoryboard(projectId, user.id);
  return createSuccessResponse(storyboard ?? { projectId, frames: [], version: 1, state: 'review_ready' }, requestId);
}

/** POST /api/projects/:id/storyboard – create or generate initial storyboard */
export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (auth.errorResponse) return auth.errorResponse;

  const { user, requestId } = auth;
  const { id: projectId } = await context.params;

  const project = await getProject(user.id, projectId);
  if (!project) {
    return createErrorResponse('NOT_FOUND', 'Project not found.', requestId, 404);
  }

  let body: any = {};
  const text = await req.text();
  if (text.trim().length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      return createErrorResponse('INVALID_BODY', 'Invalid JSON payload.', requestId, 400);
    }
  }

  if (body !== null && typeof body !== 'object') {
    return createErrorResponse('VALIDATION_ERROR', 'Request body must be a JSON object.', requestId, 400);
  }

  let rawFrames: any[] = [];
  if (body.frames !== undefined) {
    if (!Array.isArray(body.frames)) {
      return createErrorResponse('VALIDATION_ERROR', 'frames must be an array.', requestId, 400);
    }
    for (let i = 0; i < body.frames.length; i++) {
      const f = body.frames[i];
      if (!f || typeof f !== 'object') {
        return createErrorResponse('VALIDATION_ERROR', `Frame at index ${i} must be an object.`, requestId, 400);
      }
      if (typeof f.imageUrl !== 'string' || !f.imageUrl.trim()) {
        return createErrorResponse('VALIDATION_ERROR', `Frame at index ${i} requires a non-empty imageUrl string.`, requestId, 400);
      }
    }
    rawFrames = body.frames;
  }

  const { ObjectId } = await import('mongodb');

  const frames = rawFrames.length > 0 ? rawFrames.map((f, idx) => ({
    _id: f._id ? new ObjectId(String(f._id)) : new ObjectId(),
    order: typeof f.order === 'number' ? f.order : idx,
    imageUrl: f.imageUrl.trim(),
    caption: typeof f.caption === 'string' ? f.caption : '',
    narrationText: typeof f.narrationText === 'string' ? f.narrationText : '',
  })) : [
    {
      _id: new ObjectId(),
      order: 0,
      imageUrl: 'https://placehold.co/600x400/090909/e58c33?text=Scene+1',
      caption: 'Introduction',
      narrationText: body.prompt ? `Introduction: ${body.prompt}` : 'Welcome to this video.',
    },
    {
      _id: new ObjectId(),
      order: 1,
      imageUrl: 'https://placehold.co/600x400/090909/e58c33?text=Scene+2',
      caption: 'Key Concept',
      narrationText: 'Here is the core concept explained with visual clarity.',
    },
    {
      _id: new ObjectId(),
      order: 2,
      imageUrl: 'https://placehold.co/600x400/090909/e58c33?text=Scene+3',
      caption: 'Conclusion',
      narrationText: 'Summary and key takeaways.',
    },
  ];

  const storyboard = await createStoryboard(projectId, user.id, frames, body.prompt || 'Generated initial storyboard');
  return createSuccessResponse(storyboard, requestId);
}
