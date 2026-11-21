import { NextRequest } from 'next/server';
import { requireSession } from '../../../../../lib/auth/session-guard';
import {
  createSuccessResponse,
  createErrorResponse,
} from '../../../../../lib/api';
import {
  getDraft,
  updateDraft,
  UpdateDraftChanges,
} from '../../../../../lib/db/repositories/drafts';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const { user, requestId } = auth;
  const { id: projectId } = await context.params;

  const draft = await getDraft(user.id, projectId);
  if (!draft) {
    return createErrorResponse('NOT_FOUND', 'Draft or project not found.', requestId, 404);
  }

  return createSuccessResponse(draft, requestId);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const { user, requestId } = auth;
  const { id: projectId } = await context.params;

  // 1. Read and parse body with size limit
  const text = await req.text();
  if (text.length > 256 * 1024) {
    return createErrorResponse(
      'PAYLOAD_TOO_LARGE',
      'Request body exceeds 256 KiB limit.',
      requestId,
      413
    );
  }

  let body: Record<string, unknown> = {};
  if (text.trim().length === 0) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      'Request body cannot be empty.',
      requestId,
      422
    );
  }

  try {
    body = JSON.parse(text);
  } catch {
    return createErrorResponse('VALIDATION_FAILED', 'Malformed JSON body.', requestId, 400);
  }

  // 2. Reject unknown root keys
  const allowedRootKeys = ['expectedRevision', 'changes'];
  const unknownRootKeys = Object.keys(body).filter((k) => !allowedRootKeys.includes(k));
  if (unknownRootKeys.length > 0) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      `Unknown field(s) in request body: ${unknownRootKeys.join(', ')}`,
      requestId,
      422
    );
  }

  // 3. Validate expectedRevision
  if (
    body.expectedRevision === undefined ||
    typeof body.expectedRevision !== 'number' ||
    !Number.isInteger(body.expectedRevision) ||
    body.expectedRevision < 1
  ) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      'expectedRevision is required and must be an integer >= 1.',
      requestId,
      422
    );
  }
  const expectedRevision = body.expectedRevision as number;

  // 4. Validate changes object
  if (
    body.changes === undefined ||
    typeof body.changes !== 'object' ||
    body.changes === null ||
    Array.isArray(body.changes)
  ) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      'changes must be a non-null object.',
      requestId,
      422
    );
  }

  const changesObj = body.changes as Record<string, unknown>;
  const allowedChangeKeys = ['topic', 'audience', 'notes', 'voicePreset', 'editablePlan'];
  const unknownChangeKeys = Object.keys(changesObj).filter((k) => !allowedChangeKeys.includes(k));
  if (unknownChangeKeys.length > 0) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      `Unknown field(s) in changes: ${unknownChangeKeys.join(', ')}`,
      requestId,
      422
    );
  }

  if (Object.keys(changesObj).length === 0) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      'changes must contain at least one field to update.',
      requestId,
      422
    );
  }

  // 5. Type and bounds checking on changes
  if (changesObj.topic !== undefined) {
    if (typeof changesObj.topic !== 'string') {
      return createErrorResponse('VALIDATION_FAILED', 'topic must be a string.', requestId, 422);
    }
    if (changesObj.topic.length > 2000) {
      return createErrorResponse('VALIDATION_FAILED', 'topic must not exceed 2,000 characters.', requestId, 422);
    }
  }

  if (changesObj.audience !== undefined) {
    if (typeof changesObj.audience !== 'string') {
      return createErrorResponse('VALIDATION_FAILED', 'audience must be a string.', requestId, 422);
    }
    if (changesObj.audience.length > 200) {
      return createErrorResponse('VALIDATION_FAILED', 'audience must not exceed 200 characters.', requestId, 422);
    }
  }

  if (changesObj.notes !== undefined) {
    if (typeof changesObj.notes !== 'string') {
      return createErrorResponse('VALIDATION_FAILED', 'notes must be a string.', requestId, 422);
    }
    if (changesObj.notes.length > 20000) {
      return createErrorResponse('VALIDATION_FAILED', 'notes must not exceed 20,000 characters.', requestId, 422);
    }
  }

  if (changesObj.voicePreset !== undefined) {
    if (typeof changesObj.voicePreset !== 'string') {
      return createErrorResponse('VALIDATION_FAILED', 'voicePreset must be a string.', requestId, 422);
    }
  }

  if (changesObj.editablePlan !== undefined) {
    if (changesObj.editablePlan !== null && typeof changesObj.editablePlan !== 'object') {
      return createErrorResponse('VALIDATION_FAILED', 'editablePlan must be an object or null.', requestId, 422);
    }
  }

  // 6. Execute updateDraft in repository
  const updateResult = await updateDraft({
    ownerId: user.id,
    projectId,
    expectedRevision,
    changes: changesObj as UpdateDraftChanges,
  });

  if (!updateResult.success) {
    if (updateResult.error === 'NOT_FOUND') {
      return createErrorResponse('NOT_FOUND', updateResult.message, requestId, 404);
    }
    if (updateResult.error === 'REVISION_CONFLICT') {
      return createErrorResponse(
        'REVISION_CONFLICT',
        updateResult.message,
        requestId,
        409,
        {
          details: {
            currentRevision: updateResult.currentRevision,
            reloadUrl: updateResult.reloadUrl,
          },
        }
      );
    }
    if (updateResult.error === 'VOICE_UNAVAILABLE') {
      return createErrorResponse('VOICE_UNAVAILABLE', updateResult.message, requestId, 422);
    }
    return createErrorResponse('VALIDATION_FAILED', updateResult.message, requestId, 422);
  }

  return createSuccessResponse(updateResult.draft, requestId, 200);
}
