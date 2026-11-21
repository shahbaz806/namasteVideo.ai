import { renderMedia } from '@remotion/renderer';
import path from 'path';
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
  await import('fs').promises.mkdir(outDir, { recursive: true });

  await renderMedia({
    composition: 'Render',
    serveUrl: process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : 'http://localhost:3000',
    outputDir: outDir,
    codec: 'h264', // mp4 output
    envVariables: { PROJECT_ID: projectId },
    // Using default frame count from the Composition (durationInFrames)
  });

  const mp4Path = path.join(outDir, 'video.mp4');
  const url = await upload(mp4Path, `render/${jobId}/video.mp4`);
  return url;
}
