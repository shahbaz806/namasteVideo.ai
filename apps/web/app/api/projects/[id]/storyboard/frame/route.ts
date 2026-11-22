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

  const body = await req.json();
  const { imageUrl, caption, narrationText, order } = body;
  if (!imageUrl) {
    return createErrorResponse('VALIDATION_ERROR', 'imageUrl is required', requestId, 400);
  }

  try {
    const updated = await addStoryboardFrame(projectId, user.id, {
      imageUrl,
      caption: caption ?? '',
      narrationText: narrationText ?? '',
      order: order ?? 0,
    });
    return createSuccessResponse(updated, requestId);
  } catch (err: any) {
    return createErrorResponse('STORYBOARD_LOCKED', err.message, requestId, 409);
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

  const { frameId } = await req.json();
  if (!frameId) {
    return createErrorResponse('VALIDATION_ERROR', 'frameId is required', requestId, 400);
  }

  try {
    const updated = await removeStoryboardFrame(projectId, user.id, frameId);
    return createSuccessResponse(updated, requestId);
  } catch (err: any) {
    return createErrorResponse('STORYBOARD_LOCKED', err.message, requestId, 409);
  }
}
