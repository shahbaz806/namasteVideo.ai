import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session-guard';
import { createErrorResponse } from '@/lib/api';
import { getProject } from '@/lib/db/repositories/projects';
import { getRenderJob } from '@/lib/db/repositories/renderJob';

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (auth.errorResponse) return auth.errorResponse;

  const { user, requestId } = auth;
  const { jobId } = await context.params;
  if (!jobId) {
    return createErrorResponse('VALIDATION_ERROR', 'Invalid jobId', requestId, 400);
  }

  const job = await getRenderJob(jobId);
  if (!job) {
    return createErrorResponse('NOT_FOUND', 'Render job not found', requestId, 404);
  }

  const project = await getProject(user.id, String(job.projectId));
  if (!project) {
    return createErrorResponse('NOT_FOUND', 'Render job not found', requestId, 404);
  }

  return Response.json({
    status: job.status,
    stage: (job as any).stage,
    outputUrl: job.outputUrl,
    errorMessage: job.errorMessage,
  });
}
