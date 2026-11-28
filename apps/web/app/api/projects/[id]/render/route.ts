import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session-guard';
import { createErrorResponse } from '@/lib/api';
import { getProject } from '@/lib/db/repositories/projects';
import { createRenderJob } from '@/lib/db/repositories/renderJob';
import { enqueueRenderJob } from '@/lib/queues/render';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (auth.errorResponse) return auth.errorResponse;

  const { user, requestId } = auth;
  const { id: projectId } = await context.params;
  if (!projectId) {
    return createErrorResponse('VALIDATION_ERROR', 'Invalid projectId', requestId, 400);
  }

  const project = await getProject(user.id, projectId);
  if (!project) {
    return createErrorResponse('NOT_FOUND', 'Project not found', requestId, 404);
  }

  const jobId = await createRenderJob(projectId);
  await enqueueRenderJob(jobId);
  return Response.json({ jobId }, { status: 202 });
}
