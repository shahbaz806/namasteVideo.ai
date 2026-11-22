import { NextRequest } from 'next/server';
import { getRenderJob } from '@/lib/db/repositories/renderJob';

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { jobId } = await context.params;
  if (!jobId) {
    return Response.json({ error: 'Invalid jobId' }, { status: 400 });
  }

  const job = await getRenderJob(jobId);
  if (!job) {
    return Response.json({ error: 'Render job not found' }, { status: 404 });
  }

  return Response.json({
    status: job.status,
    stage: (job as any).stage,
    outputUrl: job.outputUrl,
    errorMessage: job.errorMessage,
  });
}
