import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

const CURSOR_SECRET = process.env.BETTER_AUTH_SECRET || 'dev-cursor-secret-namaste-video';

export interface ApiResponseMeta {
  requestId: string;
}

export interface ApiSuccessEnvelope<T> {
  data: T;
  meta: ApiResponseMeta;
}

export interface ApiListEnvelope<T> {
  data: T[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  meta: ApiResponseMeta;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  requestId: string;
  retryable: boolean;
  details?: unknown;
  fieldErrors?: Array<{ path: string; code: string; message: string }>;
}

export interface ApiErrorEnvelope {
  error: ApiErrorDetail;
  meta: ApiResponseMeta;
}

export interface AcceptedOperation {
  jobId: string;
  resource: { kind: string; id: string } | null;
  state: 'queued' | 'running' | 'cancel_requested' | 'cancelled' | 'succeeded' | 'needs_input' | 'failed';
  statusUrl: string;
}

export function defaultHeaders(requestId: string, extraHeaders?: Record<string, string>): Record<string, string> {
  return {
    'X-Request-Id': requestId,
    'Cache-Control': 'private, no-store',
    ...extraHeaders,
  };
}

export function createSuccessResponse<T>(
  data: T,
  requestId: string,
  status = 200,
  extraHeaders?: Record<string, string>
): NextResponse<ApiSuccessEnvelope<T>> {
  return NextResponse.json(
    { data, meta: { requestId } },
    { status, headers: defaultHeaders(requestId, extraHeaders) }
  );
}

export function createListResponse<T>(
  data: T[],
  page: { nextCursor: string | null; hasMore: boolean },
  requestId: string,
  status = 200,
  extraHeaders?: Record<string, string>
): NextResponse<ApiListEnvelope<T>> {
  return NextResponse.json(
    { data, page, meta: { requestId } },
    { status, headers: defaultHeaders(requestId, extraHeaders) }
  );
}

export function createAcceptedResponse(
  data: AcceptedOperation,
  requestId: string,
  extraHeaders?: Record<string, string>
): NextResponse<ApiSuccessEnvelope<AcceptedOperation>> {
  return NextResponse.json(
    { data, meta: { requestId } },
    {
      status: 202,
      headers: defaultHeaders(requestId, {
        Location: data.statusUrl,
        ...extraHeaders,
      }),
    }
  );
}

export function createErrorResponse(
  code: string,
  message: string,
  requestId: string,
  status: number,
  options?: {
    retryable?: boolean;
    details?: unknown;
    fieldErrors?: Array<{ path: string; code: string; message: string }>;
    extraHeaders?: Record<string, string>;
  }
): NextResponse<ApiErrorEnvelope> {
  const errorObj: ApiErrorDetail = {
    code,
    message,
    requestId,
    retryable: options?.retryable ?? false,
  };

  if (options?.details !== undefined) {
    errorObj.details = options.details;
  }
  if (options?.fieldErrors !== undefined) {
    errorObj.fieldErrors = options.fieldErrors;
  }

  return NextResponse.json(
    { error: errorObj, meta: { requestId } },
    { status, headers: defaultHeaders(requestId, options?.extraHeaders) }
  );
}

// ---------------- Cursors ----------------
interface ProjectCursorPayload {
  v: 1;
  ownerId: string;
  route: string;
  filter: string;
  updatedAt: string;
  id: string;
  exp: number;
}

export function encodeProjectCursor(
  ownerId: string,
  filter: string,
  updatedAt: Date | string,
  id: string
): string {
  const dateStr = updatedAt instanceof Date ? updatedAt.toISOString() : new Date(updatedAt).toISOString();
  const payload: ProjectCursorPayload = {
    v: 1,
    ownerId,
    route: '/api/projects',
    filter,
    updatedAt: dateStr,
    id,
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours validity
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', CURSOR_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${hmac}`;
}

export function decodeProjectCursor(
  cursor: string,
  expectedOwnerId: string,
  expectedFilter: string
): { updatedAt: Date; id: string } | null {
  if (!cursor || typeof cursor !== 'string' || cursor.length > 2048) {
    return null;
  }

  const parts = cursor.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadB64, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', CURSOR_SECRET).update(payloadB64).digest('base64url');

  if (
    signature.length !== expectedSig.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
  ) {
    return null;
  }

  try {
    const jsonStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(jsonStr) as Partial<ProjectCursorPayload>;

    if (
      payload.v !== 1 ||
      payload.ownerId !== expectedOwnerId ||
      payload.route !== '/api/projects' ||
      payload.filter !== expectedFilter ||
      typeof payload.updatedAt !== 'string' ||
      typeof payload.id !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }

    if (Date.now() > payload.exp) {
      return null;
    }

    const date = new Date(payload.updatedAt);
    if (isNaN(date.getTime())) {
      return null;
    }

    return { updatedAt: date, id: payload.id };
  } catch {
    return null;
  }
}

// ---------------- Idempotency Keys ----------------
export function validateIdempotencyKey(keyHeader: string | null): { valid: boolean; key?: string; error?: string } {
  if (!keyHeader) {
    return { valid: false, error: 'Idempotency-Key header is required for this operation.' };
  }
  const trimmed = keyHeader.trim();
  // 16..128 printable ASCII characters (0x20..0x7E)
  if (trimmed.length < 16 || trimmed.length > 128) {
    return { valid: false, error: 'Idempotency-Key must be between 16 and 128 characters.' };
  }
  if (!/^[\x20-\x7E]+$/.test(trimmed)) {
    return { valid: false, error: 'Idempotency-Key contains invalid characters.' };
  }
  return { valid: true, key: trimmed };
}

export function hashRequestBody(body: unknown): string {
  const json = JSON.stringify(body ?? null);
  return crypto.createHash('sha256').update(json).digest('hex');
}
