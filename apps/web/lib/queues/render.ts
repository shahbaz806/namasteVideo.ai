import { enqueue } from '@vercel/queue';

/** Enqueue a render job for background processing */
export async function enqueueRenderJob(jobId: string) {
  await enqueue('render', { jobId });
}
