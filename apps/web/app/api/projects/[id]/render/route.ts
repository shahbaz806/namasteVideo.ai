import { NextRequest } from 'next/server';
import { createRenderJob } from '@/lib/db/repositories/renderJob';
import { enqueueRenderJob } from '@/lib/queues/render';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { id: projectId } = await context.params;
  if (!projectId) {
    return Response.json({ error: 'Invalid projectId' }, { status: 400 });
  }

  const jobId = await createRenderJob(projectId);
  await enqueueRenderJob(jobId);
  return Response.json({ jobId }, { status: 202 });
}
