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
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const frames = body.frames || [
    {
      order: 0,
      imageUrl: 'https://placehold.co/600x400/090909/e58c33?text=Scene+1',
      caption: 'Introduction',
      narrationText: body.prompt ? `Introduction: ${body.prompt}` : 'Welcome to this video.',
    },
    {
      order: 1,
      imageUrl: 'https://placehold.co/600x400/090909/e58c33?text=Scene+2',
      caption: 'Key Concept',
      narrationText: 'Here is the core concept explained with visual clarity.',
    },
    {
      order: 2,
      imageUrl: 'https://placehold.co/600x400/090909/e58c33?text=Scene+3',
      caption: 'Conclusion',
      narrationText: 'Summary and key takeaways.',
    },
  ];

  const storyboard = await createStoryboard(projectId, user.id, frames, body.prompt || 'Generated initial storyboard');
  return createSuccessResponse(storyboard, requestId);
}
