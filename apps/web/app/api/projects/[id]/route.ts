import { NextRequest } from 'next/server';
import { requireSession } from '../../../../lib/auth/session-guard';
import {
  createSuccessResponse,
  createAcceptedResponse,
  createErrorResponse,
  validateIdempotencyKey,
  hashRequestBody,
} from '../../../../lib/api';
import {
  getProject,
  updateProject,
  softDeleteProject,
} from '../../../../lib/db/repositories/projects';

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

  const project = await getProject(user.id, projectId);
  if (!project) {
    return createErrorResponse('NOT_FOUND', 'Project not found.', requestId, 404);
  }

  return createSuccessResponse(project, requestId);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const { user, requestId } = auth;
  const { id: projectId } = await context.params;

  // 1. Parse JSON body
  let body: Record<string, unknown> = {};
  const text = await req.text();
  if (text.length > 256 * 1024) {
    return createErrorResponse(
      'PAYLOAD_TOO_LARGE',
      'Request body exceeds 256 KiB limit.',
      requestId,
      413
    );
  }

  try {
    body = JSON.parse(text);
  } catch {
    return createErrorResponse('VALIDATION_FAILED', 'Malformed JSON body.', requestId, 400);
  }

  // Reject unknown fields
  const allowedKeys = ['expectedRevision', 'title', 'selectedVideoId'];
  const unknownKeys = Object.keys(body).filter((k) => !allowedKeys.includes(k));
  if (unknownKeys.length > 0) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      `Unknown field(s) in request body: ${unknownKeys.join(', ')}`,
      requestId,
      422
    );
  }

  // Validate expectedRevision
  if (
    typeof body.expectedRevision !== 'number' ||
    !Number.isInteger(body.expectedRevision) ||
    body.expectedRevision < 1
  ) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      'expectedRevision must be an integer >= 1.',
      requestId,
      422
    );
  }

  // Validate at least one change
  if (body.title === undefined && body.selectedVideoId === undefined) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      'At least one change (title or selectedVideoId) must be provided.',
      requestId,
      422
    );
  }

  if (body.title !== undefined && typeof body.title !== 'string') {
    return createErrorResponse(
      'VALIDATION_FAILED',
      'Title must be a string if provided.',
      requestId,
      422
    );
  }

  if (body.selectedVideoId !== undefined && typeof body.selectedVideoId !== 'string') {
    return createErrorResponse(
      'VALIDATION_FAILED',
      'selectedVideoId must be a string if provided.',
      requestId,
      422
    );
  }

  // Execute update
  const result = await updateProject({
    ownerId: user.id,
    projectId,
    expectedRevision: body.expectedRevision,
    title: body.title as string | undefined,
    selectedVideoId: body.selectedVideoId as string | undefined,
  });

  if (!result.success) {
    if (result.error === 'NOT_FOUND') {
      return createErrorResponse('NOT_FOUND', result.message, requestId, 404);
    }
    if (result.error === 'REVISION_CONFLICT') {
      return createErrorResponse('REVISION_CONFLICT', result.message, requestId, 409, {
        details: {
          currentRevision: result.currentRevision,
          reloadUrl: `/api/projects/${projectId}`,
        },
      });
    }
    return createErrorResponse(result.error, result.message, requestId, 422);
  }

  return createSuccessResponse(result.project, requestId, 200);
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const { user, requestId } = auth;
  const { id: projectId } = await context.params;

  // 1. Validate Idempotency-Key
  const idempValidation = validateIdempotencyKey(req.headers.get('idempotency-key'));
  if (!idempValidation.valid || !idempValidation.key) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      idempValidation.error || 'Idempotency-Key header is required.',
      requestId,
      422
    );
  }
  const idempotencyKey = idempValidation.key;

  // 2. Parse JSON body
  let body: Record<string, unknown> = {};
  const text = await req.text();
  if (text.length > 256 * 1024) {
    return createErrorResponse(
      'PAYLOAD_TOO_LARGE',
      'Request body exceeds 256 KiB limit.',
      requestId,
      413
    );
  }

  try {
    body = JSON.parse(text);
  } catch {
    return createErrorResponse('VALIDATION_FAILED', 'Malformed JSON body.', requestId, 400);
  }

  // Reject unknown fields
  const allowedKeys = ['expectedRevision', 'confirm'];
  const unknownKeys = Object.keys(body).filter((k) => !allowedKeys.includes(k));
  if (unknownKeys.length > 0) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      `Unknown field(s) in request body: ${unknownKeys.join(', ')}`,
      requestId,
      422
    );
  }

  // Validate confirm and expectedRevision
  if (body.confirm !== true) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      'Deletion requires confirm: true.',
      requestId,
      422
    );
  }

  if (
    typeof body.expectedRevision !== 'number' ||
    !Number.isInteger(body.expectedRevision) ||
    body.expectedRevision < 1
  ) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      'expectedRevision must be an integer >= 1.',
      requestId,
      422
    );
  }

  const requestHash = hashRequestBody(body);

  const result = await softDeleteProject({
    ownerId: user.id,
    projectId,
    expectedRevision: body.expectedRevision,
    idempotencyKey,
    requestHash,
  });

  if (!result.success) {
    if (result.error === 'NOT_FOUND') {
      return createErrorResponse('NOT_FOUND', result.message, requestId, 404);
    }
    if (result.error === 'REVISION_CONFLICT') {
      return createErrorResponse('REVISION_CONFLICT', result.message, requestId, 409, {
        details: {
          currentRevision: result.currentRevision,
          reloadUrl: `/api/projects/${projectId}`,
        },
      });
    }
    if (result.error === 'IDEMPOTENCY_KEY_REUSED') {
      return createErrorResponse('IDEMPOTENCY_KEY_REUSED', result.message, requestId, 409);
    }
    return createErrorResponse('VALIDATION_FAILED', (result as any).message, requestId, 422);
  }

  const extraHeaders: Record<string, string> = {};
  if (result.replayed) {
    extraHeaders['Idempotency-Replayed'] = 'true';
  }

  return createAcceptedResponse(result.operation, requestId, extraHeaders);
}
