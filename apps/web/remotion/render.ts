import { renderMedia } from '@remotion/renderer';
import path from 'path';
import { promises as fs } from 'fs';
import { upload } from '@/lib/blob';

/**
 * Render a video for a given render job.
 * Returns the public URL of the generated MP4 file.
 */
export async function renderVideo(
  jobId: string,
  projectId: string,
  audioPath: string
): Promise<string> {
  const outDir = path.resolve('tmp', jobId);
  // Ensure output directory exists
  await fs.mkdir(outDir, { recursive: true });

  const mp4Path = path.join(outDir, 'video.mp4');

  await renderMedia({
    composition: {
      id: 'Render',
      durationInFrames: 300,
      fps: 30,
      width: 1920,
      height: 1080,
      props: { projectId, audioPath },
    } as any,
    serveUrl: process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : 'http://localhost:3000',
    outputLocation: mp4Path,
    codec: 'h264', // mp4 output
    inputProps: { projectId, audioPath },
    envVariables: { PROJECT_ID: projectId, AUDIO_PATH: audioPath },
  } as any);

  const url = await upload(mp4Path, `render/${jobId}/video.mp4`);
  return url;
}
