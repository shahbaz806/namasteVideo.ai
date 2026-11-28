import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session-guard';
import { createSuccessResponse, createErrorResponse } from '@/lib/api';
import { getProject } from '@/lib/db/repositories/projects';
import { createStoryboardRevision, listStoryboardVersions } from '@/lib/db/repositories/storyboard';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/:id/revisions
 *   List all storyboard versions / revisions for the project
 */
export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (auth.errorResponse) return auth.errorResponse;

  const { user, requestId } = auth;
  const { id: projectId } = await context.params;

  const project = await getProject(user.id, projectId);
  if (!project) {
    return createErrorResponse('NOT_FOUND', 'Project not found.', requestId, 404);
  }

  const versions = await listStoryboardVersions(projectId, user.id);
  return createSuccessResponse(versions, requestId);
}

/**
 * POST /api/projects/:id/revisions
 *   Submit a conversational revision instruction (e.g. "make scene 2 more energetic", "shorten scene 1")
 *   Body: { instruction: string, sceneId?: string }
 */
export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (auth.errorResponse) return auth.errorResponse;

  const { user, requestId } = auth;
  const { id: projectId } = await context.params;

  const project = await getProject(user.id, projectId);
  if (!project) {
    return createErrorResponse('NOT_FOUND', 'Project not found.', requestId, 404);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return createErrorResponse('INVALID_BODY', 'Invalid JSON payload.', requestId, 400);
  }

  if (!body || typeof body !== 'object') {
    return createErrorResponse('VALIDATION_ERROR', 'Request body must be a JSON object.', requestId, 400);
  }

  const { instruction, sceneId } = body;
  if (!instruction || typeof instruction !== 'string' || instruction.trim().length === 0) {
    return createErrorResponse('VALIDATION_ERROR', 'A non-empty revision instruction is required.', requestId, 400);
  }

  if (instruction.length > 4000) {
    return createErrorResponse('VALIDATION_ERROR', 'Instruction exceeds maximum 4,000 characters.', requestId, 400);
  }

  if (sceneId !== undefined && (typeof sceneId !== 'string' || !sceneId.trim())) {
    return createErrorResponse('VALIDATION_ERROR', 'When provided, sceneId must be a non-empty string.', requestId, 400);
  }

  try {
    const revision = await createStoryboardRevision(projectId, user.id, instruction.trim(), sceneId ? sceneId.trim() : undefined);
    return createSuccessResponse(revision, requestId, 201);
  } catch (err: any) {
    console.error('Failed to create storyboard revision:', err);
    return createErrorResponse('REVISION_FAILED', 'Failed to create revision.', requestId, 500);
  }
}
