import { getRenderJob, updateRenderJob } from '../apps/web/lib/db/repositories/renderJob';
import { renderVideo } from '../apps/web/remotion/render';
import { generateNarration } from '../apps/web/lib/elevenlabs';
import path from 'path';
import { promises as fs } from 'fs';
import { Types } from 'mongoose';

/**
 * Render worker entry point.
 * Usage: `node scripts/renderWorker.js <jobId>`
 */
async function main() {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error('JobId argument required');
    process.exit(1);
  }

  // Mark job as running
  await updateRenderJob(jobId, { status: 'running' } as any);

  try {
    const job = await getRenderJob(jobId);
    if (!job) throw new Error('Render job not found');
    const projectId = (job.projectId as Types.ObjectId).toHexString();
    // -------------------------------------------------
    // ① Create narration audio via ElevenLabs
    // -------------------------------------------------
    const narrationText = (job as any).storyboard?.narrationText ?? 'Placeholder narration for testing.';
    const voicePreset = (job as any).voicePreset ?? 'male';
    const voiceId =
      voicePreset === 'female'
        ? process.env.ELEVENLABS_VOICE_ID_INDIAN_FEMALE!
        : process.env.ELEVENLABS_VOICE_ID_INDIAN_MALE!;
    await updateRenderJob(jobId, { stage: 'creating_narration' } as any);
    const audioBuffer = await generateNarration(narrationText, voiceId);
    const outDir = path.resolve('tmp', jobId);
    await fs.mkdir(outDir, { recursive: true });
    const audioPath = path.join(outDir, 'audio.mp3');
    await fs.writeFile(audioPath, audioBuffer);
    console.log('Narration audio written to', audioPath);
    // -------------------------------------------------
    // ② Render video with audio
    // -------------------------------------------------
    await updateRenderJob(jobId, { stage: 'rendering_video' } as any);
    const url = await renderVideo(jobId, projectId, audioPath);
    await updateRenderJob(jobId, { status: 'completed', outputUrl: url, stage: 'checking_output' } as any);
    await updateRenderJob(jobId, { status: 'completed', outputUrl: url } as any);
    console.log('Render completed', url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateRenderJob(jobId, { status: 'failed', errorMessage: message } as any);
    console.error('Render failed', message);
    process.exit(1);
  }
}

main();
