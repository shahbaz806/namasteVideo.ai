import { NextRequest } from 'next/server';
import { requireSession } from '../../../../lib/auth/session-guard';
import { createSuccessResponse, createErrorResponse } from '../../../../lib/api';
import { getJob } from '../../../../lib/db/repositories/jobs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const { user, requestId } = auth;
  const { id: jobId } = await context.params;

  const job = await getJob(user.id, jobId);
  if (!job) {
    return createErrorResponse('NOT_FOUND', 'Job not found.', requestId, 404);
  }

  return createSuccessResponse(job, requestId);
}
