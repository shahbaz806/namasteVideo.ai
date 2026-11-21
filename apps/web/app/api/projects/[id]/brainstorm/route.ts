import { NextRequest } from 'next/server';
import { requireSession } from '../../../../../lib/auth/session-guard';
import {
  createAcceptedResponse,
  createErrorResponse,
  validateIdempotencyKey,
  hashRequestBody,
} from '../../../../../lib/api';
import { createBrainstormJob } from '../../../../../lib/db/repositories/jobs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
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

  // 2. Parse and validate JSON body
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
  try {
    body = JSON.parse(text);
  } catch {
    return createErrorResponse('VALIDATION_FAILED', 'Malformed JSON body.', requestId, 400);
  }

  // Reject unknown fields
  const allowedKeys = ['expectedDraftRevision', 'prompt'];
  const unknownKeys = Object.keys(body).filter((k) => !allowedKeys.includes(k));
  if (unknownKeys.length > 0) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      `Unknown field(s) in request body: ${unknownKeys.join(', ')}`,
      requestId,
      422
    );
  }

  // Validate expectedDraftRevision
  if (
    body.expectedDraftRevision === undefined ||
    typeof body.expectedDraftRevision !== 'number' ||
    !Number.isInteger(body.expectedDraftRevision) ||
    body.expectedDraftRevision < 1
  ) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      'expectedDraftRevision is required and must be an integer >= 1.',
      requestId,
      422
    );
  }

  // Validate prompt (1..2000 chars)
  if (
    body.prompt === undefined ||
    typeof body.prompt !== 'string' ||
    body.prompt.trim().length === 0 ||
    body.prompt.length > 2000
  ) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      'prompt is required and must be between 1 and 2,000 characters.',
      requestId,
      422
    );
  }

  const requestHash = hashRequestBody(body);

  // 3. Create brainstorm job
  const result = await createBrainstormJob({
    ownerId: user.id,
    projectId,
    prompt: body.prompt.trim(),
    expectedDraftRevision: body.expectedDraftRevision,
    idempotencyKey,
    requestHash,
  });

  if (!result.success) {
    if (result.error === 'NOT_FOUND') {
      return createErrorResponse('NOT_FOUND', result.message, requestId, 404);
    }
    if (result.error === 'PROJECT_BUSY') {
      return createErrorResponse(
        'PROJECT_BUSY',
        result.message,
        requestId,
        409,
        { details: { activeJobId: result.activeJobId } }
      );
    }
    if (result.error === 'REVISION_CONFLICT') {
      return createErrorResponse(
        'REVISION_CONFLICT',
        result.message,
        requestId,
        409,
        { details: { currentRevision: result.currentRevision } }
      );
    }
    if (result.error === 'IDEMPOTENCY_KEY_REUSED') {
      return createErrorResponse('IDEMPOTENCY_KEY_REUSED', result.message, requestId, 409);
    }
    return createErrorResponse('VALIDATION_FAILED', result.message, requestId, 422);
  }

  const extraHeaders: Record<string, string> = {};
  if (result.replayed) {
    extraHeaders['Idempotency-Replayed'] = 'true';
  }

  return createAcceptedResponse(result.operation, requestId, extraHeaders);
}
