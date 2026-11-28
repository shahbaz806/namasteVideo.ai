import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session-guard';
import { createSuccessResponse, createErrorResponse } from '@/lib/api';
import { getProject } from '@/lib/db/repositories/projects';
import { approveStoryboard, getStoryboard } from '@/lib/db/repositories/storyboard';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/:id/storyboard/approve
 *   Locks and approves the storyboard, creating an immutable approval record in `approvals` collection
 *   Body: { storyboardId?: string }
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

  if (body?.storyboardId !== undefined && (typeof body.storyboardId !== 'string' || !body.storyboardId.trim())) {
    return createErrorResponse('VALIDATION_ERROR', 'When provided, storyboardId must be a non-empty string.', requestId, 400);
  }

  try {
    const result = await approveStoryboard(projectId, user.id, body?.storyboardId ? body.storyboardId.trim() : undefined);
    return createSuccessResponse(result, requestId);
  } catch (err: any) {
    return createErrorResponse('APPROVAL_FAILED', err.message || 'Failed to approve storyboard.', requestId, 400);
  }
}
