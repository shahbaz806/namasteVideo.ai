import type { NextApiRequest, NextApiResponse } from 'next';
import { getRenderJob } from '@/lib/db/repositories/renderJob';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { jobId } = req.query;
  if (typeof jobId !== 'string') {
    return res.status(400).json({ error: 'Invalid jobId' });
  }
  const job = await getRenderJob(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Render job not found' });
  }
  res.status(200).json({
    status: job.status,
    stage: (job as any).stage,
    outputUrl: job.outputUrl,
    errorMessage: job.errorMessage,
  });
}
