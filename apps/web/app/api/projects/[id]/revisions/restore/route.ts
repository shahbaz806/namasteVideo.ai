import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session-guard';
import { createSuccessResponse, createErrorResponse } from '@/lib/api';
import { getProject } from '@/lib/db/repositories/projects';
import { restoreStoryboardVersion } from '@/lib/db/repositories/storyboard';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/:id/revisions/restore
 *   Restore an earlier storyboard snapshot as a new working revision
 *   Body: { targetVersionId: string }
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

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return createErrorResponse('INVALID_BODY', 'Invalid JSON payload.', requestId, 400);
  }

  const { targetVersionId } = body;
  if (!targetVersionId || typeof targetVersionId !== 'string') {
    return createErrorResponse('VALIDATION_ERROR', 'targetVersionId is required.', requestId, 400);
  }

  try {
    const restored = await restoreStoryboardVersion(projectId, user.id, targetVersionId);
    return createSuccessResponse(restored, requestId);
  } catch (err: any) {
    return createErrorResponse('RESTORE_FAILED', err.message || 'Failed to restore storyboard version.', requestId, 400);
  }
}
