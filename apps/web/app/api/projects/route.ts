import { NextRequest } from 'next/server';
import { requireSession } from '../../../lib/auth/session-guard';
import {
  createSuccessResponse,
  createListResponse,
  createErrorResponse,
  validateIdempotencyKey,
  hashRequestBody,
} from '../../../lib/api';
import {
  createProject,
  listProjects,
  ProjectFilter,
  VALID_PROJECT_FILTERS,
} from '../../../lib/db/repositories/projects';

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const { user, requestId } = auth;
  const searchParams = req.nextUrl.searchParams;

  // 1. Parse limit
  let limit: number | undefined;
  const rawLimit = searchParams.get('limit');
  if (rawLimit !== null) {
    limit = parseInt(rawLimit, 10);
    if (isNaN(limit) || limit < 1 || limit > 50) {
      return createErrorResponse(
        'VALIDATION_FAILED',
        'Limit must be an integer between 1 and 50.',
        requestId,
        400
      );
    }
  }

  // 2. Parse cursor
  const cursor = searchParams.get('cursor') || undefined;

  // 3. Parse filter
  const rawFilter = searchParams.get('filter') || 'all';
  if (!VALID_PROJECT_FILTERS.includes(rawFilter as ProjectFilter)) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      `Filter must be one of: ${VALID_PROJECT_FILTERS.join(', ')}`,
      requestId,
      400
    );
  }
  const filter = rawFilter as ProjectFilter;

  // 4. Query projects
  const result = await listProjects({
    ownerId: user.id,
    limit,
    cursor,
    filter,
  });

  if (!result.success) {
    return createErrorResponse(
      result.error,
      result.message,
      requestId,
      result.error === 'INVALID_CURSOR' ? 400 : 400
    );
  }

  return createListResponse(result.projects, result.page, requestId);
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const { user, requestId } = auth;

  // 1. Validate Idempotency-Key header
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

  if (text.trim().length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      return createErrorResponse('VALIDATION_FAILED', 'Malformed JSON body.', requestId, 400);
    }
  }

  // Reject unknown fields
  const allowedKeys = ['title'];
  const unknownKeys = Object.keys(body).filter((k) => !allowedKeys.includes(k));
  if (unknownKeys.length > 0) {
    return createErrorResponse(
      'VALIDATION_FAILED',
      `Unknown field(s) in request body: ${unknownKeys.join(', ')}`,
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

  const requestHash = hashRequestBody(body);

  // 3. Create project
  const result = await createProject({
    ownerId: user.id,
    title: body.title as string | undefined,
    idempotencyKey,
    requestHash,
  });

  if (!result.success) {
    const status = result.error === 'IDEMPOTENCY_KEY_REUSED' ? 409 : 422;
    return createErrorResponse(result.error, result.message, requestId, status);
  }

  const extraHeaders: Record<string, string> = {
    Location: `/api/projects/${result.project.id}`,
  };
  if (result.replayed) {
    extraHeaders['Idempotency-Replayed'] = 'true';
  }

  return createSuccessResponse(result.project, requestId, 201, extraHeaders);
}
