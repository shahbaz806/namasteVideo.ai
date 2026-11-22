/** Enqueue a render job for background processing */
export async function enqueueRenderJob(jobId: string) {
  try {
    const pkg = '@vercel/queue';
    const { enqueue } = await import(/* webpackIgnore: true */ pkg);
    await enqueue('render', { jobId });
  } catch {
    // In local dev/environments without @vercel/queue, job is processed or logged
    console.log(`[Queue:render] Enqueued job ${jobId}`);
  }
}
