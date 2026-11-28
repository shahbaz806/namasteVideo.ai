import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session-guard';
import { createSuccessResponse, createErrorResponse } from '@/lib/api';
import { getProject } from '@/lib/db/repositories/projects';
import { addStoryboardFrame, removeStoryboardFrame, reorderStoryboardFrames } from '@/lib/db/repositories/storyboard';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/storyboard/frame
 *   Adds a new frame to the storyboard.
 *   Body: { imageUrl: string, caption?: string, narrationText?: string, order?: number }
 */
export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (auth.errorResponse) return auth.errorResponse;

  const { user, requestId } = auth;
  const { id: projectId } = await context.params;

  const project = await getProject(user.id, projectId);
  if (!project) return createErrorResponse('NOT_FOUND', 'Project not found', requestId, 404);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return createErrorResponse('INVALID_BODY', 'Invalid JSON payload', requestId, 400);
  }

  if (!body || typeof body !== 'object') {
    return createErrorResponse('VALIDATION_ERROR', 'Request body must be a JSON object', requestId, 400);
  }

  const { imageUrl, caption, narrationText, order } = body;
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
    return createErrorResponse('VALIDATION_ERROR', 'imageUrl must be a non-empty string', requestId, 400);
  }
  if (caption !== undefined && typeof caption !== 'string') {
    return createErrorResponse('VALIDATION_ERROR', 'caption must be a string', requestId, 400);
  }
  if (narrationText !== undefined && typeof narrationText !== 'string') {
    return createErrorResponse('VALIDATION_ERROR', 'narrationText must be a string', requestId, 400);
  }
  if (order !== undefined && typeof order !== 'number') {
    return createErrorResponse('VALIDATION_ERROR', 'order must be a number', requestId, 400);
  }

  try {
    const updated = await addStoryboardFrame(projectId, user.id, {
      imageUrl: imageUrl.trim(),
      caption: caption ?? '',
      narrationText: narrationText ?? '',
      order: order ?? 0,
    });
    return createSuccessResponse(updated, requestId);
  } catch (err: any) {
    if (err?.message?.includes('approved')) {
      return createErrorResponse('STORYBOARD_LOCKED', err.message, requestId, 409);
    }
    console.error('Failed to add storyboard frame:', err);
    return createErrorResponse('INTERNAL_ERROR', 'Failed to update storyboard frame', requestId, 500);
  }
}

/**
 * DELETE /api/projects/[id]/storyboard/frame
 *   Removes a frame from the storyboard.
 *   Body: { frameId: string }
 */
export async function DELETE(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (auth.errorResponse) return auth.errorResponse;

  const { user, requestId } = auth;
  const { id: projectId } = await context.params;

  const project = await getProject(user.id, projectId);
  if (!project) return createErrorResponse('NOT_FOUND', 'Project not found', requestId, 404);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return createErrorResponse('INVALID_BODY', 'Invalid JSON payload', requestId, 400);
  }

  if (!body || typeof body !== 'object' || typeof body.frameId !== 'string' || !body.frameId.trim()) {
    return createErrorResponse('VALIDATION_ERROR', 'frameId must be a non-empty string', requestId, 400);
  }

  try {
    const updated = await removeStoryboardFrame(projectId, user.id, body.frameId.trim());
    return createSuccessResponse(updated, requestId);
  } catch (err: any) {
    if (err?.message?.includes('approved')) {
      return createErrorResponse('STORYBOARD_LOCKED', err.message, requestId, 409);
    }
    console.error('Failed to remove storyboard frame:', err);
    return createErrorResponse('INTERNAL_ERROR', 'Failed to update storyboard frame', requestId, 500);
  }
}

/**
 * PATCH /api/projects/[id]/storyboard/frame
 *   Reorders frames in the storyboard.
 *   Body: { orderedIds: string[] }
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (auth.errorResponse) return auth.errorResponse;

  const { user, requestId } = auth;
  const { id: projectId } = await context.params;

  const project = await getProject(user.id, projectId);
  if (!project) return createErrorResponse('NOT_FOUND', 'Project not found', requestId, 404);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return createErrorResponse('INVALID_BODY', 'Invalid JSON payload', requestId, 400);
  }

  if (!body || typeof body !== 'object' || !Array.isArray(body.orderedIds)) {
    return createErrorResponse('VALIDATION_ERROR', 'orderedIds must be an array of frame IDs', requestId, 400);
  }

  try {
    const updated = await reorderStoryboardFrames(projectId, user.id, body.orderedIds);
    return createSuccessResponse(updated, requestId);
  } catch (err: any) {
    if (err?.message?.includes('approved')) {
      return createErrorResponse('STORYBOARD_LOCKED', err.message, requestId, 409);
    }
    console.error('Failed to reorder storyboard frames:', err);
    return createErrorResponse('INTERNAL_ERROR', 'Failed to update storyboard frame', requestId, 500);
  }
}
