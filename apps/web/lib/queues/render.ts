import { updateRenderJob } from '@/lib/db/repositories/renderJob';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Enqueue a render job for background processing */
export async function enqueueRenderJob(jobId: string) {
  try {
    const pkg = '@vercel/queue';
    const { enqueue } = await import(/* webpackIgnore: true */ pkg);
    await enqueue('render', { jobId });
  } catch (queueErr) {
    // If running in production with Vercel Queue, fail fast instead of simulating
    if (process.env.NODE_ENV === 'production' && process.env.VERCEL) {
      console.error('[Queue:render] Failed to enqueue render job in production:', queueErr);
      await updateRenderJob(jobId, { status: 'failed', errorMessage: 'Queue unavailable' } as any);
      return;
    }

    // In local dev/environments without @vercel/queue, simulate background render stages
    console.log(`[Queue:render] Local development mode: processing job ${jobId}`);
    (async () => {
      try {
        await sleep(1000);
        await updateRenderJob(jobId, { status: 'running', stage: 'creating_narration' } as any);
        await sleep(2000);
        await updateRenderJob(jobId, { status: 'running', stage: 'rendering_video' } as any);
        await sleep(2500);
        await updateRenderJob(jobId, {
          status: 'completed',
          stage: 'completed',
          outputUrl: '/sample-video.mp4',
        } as any);
        console.log(`[Queue:render] Local job ${jobId} completed`);
      } catch (err) {
        console.error('[Queue:render] Error in render pipeline:', err);
        try {
          await updateRenderJob(jobId, {
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'Render failed',
          } as any);
        } catch (innerErr) {
          console.error('[Queue:render] Could not record job failure:', innerErr);
        }
      }
    })();
  }
}

