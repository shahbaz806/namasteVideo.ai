import { updateRenderJob } from '@/lib/db/repositories/renderJob';

/** Enqueue a render job for background processing */
export async function enqueueRenderJob(jobId: string) {
  try {
    const pkg = '@vercel/queue';
    const { enqueue } = await import(/* webpackIgnore: true */ pkg);
    await enqueue('render', { jobId });
  } catch {
    // In local dev/environments without @vercel/queue, simulate background render stages
    console.log(`[Queue:render] Local development mode: processing job ${jobId}`);
    setTimeout(async () => {
      try {
        await updateRenderJob(jobId, { status: 'running', stage: 'creating_narration' } as any);
        setTimeout(async () => {
          await updateRenderJob(jobId, { status: 'running', stage: 'rendering_video' } as any);
          setTimeout(async () => {
            await updateRenderJob(jobId, {
              status: 'completed',
              stage: 'completed',
              outputUrl: '/sample-video.mp4',
            } as any);
            console.log(`[Queue:render] Local job ${jobId} completed`);
          }, 2500);
        }, 2000);
      } catch (err) {
        console.error('[Queue:render] Error updating local job', err);
      }
    }, 1000);
  }
}

