import type { NextApiRequest, NextApiResponse } from 'next';
import { createRenderJob } from '@/lib/db/repositories/renderJob';
import { enqueueRenderJob } from '@/lib/queues/render';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const { projectId } = req.query;
  if (typeof projectId !== 'string') {
    return res.status(400).json({ error: 'Invalid projectId' });
  }

  const jobId = await createRenderJob(projectId);
  await enqueueRenderJob(jobId);
  res.status(202).json({ jobId });
}
