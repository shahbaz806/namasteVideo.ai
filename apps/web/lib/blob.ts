import fs from 'fs';
import path from 'path';

/**
 * Upload a local file to Vercel Blob storage (or local fallback) and return the public URL.
 * The caller should provide a destination path (e.g., `render/<jobId>/video.mp4`).
 */
export async function upload(filePath: string, destination: string): Promise<string> {
  const fileBuffer = await fs.promises.readFile(filePath);
  const mime = destination.endsWith('.mp4') ? 'video/mp4' : 'video/webm';

  try {
    // Dynamic import to avoid strict compile-time failure if package is absent in dev
    const { put } = await import('@vercel/blob' as any);
    const blob = await put(destination, fileBuffer, { access: 'public', contentType: mime });
    return blob.url;
  } catch (err) {
    if (process.env.NODE_ENV === 'production' && process.env.BLOB_READ_WRITE_TOKEN) {
      throw err;
    }
    // Fallback: Copy to public directory so it is genuinely served locally
    const publicDir = path.resolve(process.cwd(), 'apps/web/public');
    await fs.promises.mkdir(publicDir, { recursive: true });
    const targetName = path.basename(destination);
    const localTarget = path.join(publicDir, targetName);
    await fs.promises.copyFile(filePath, localTarget);
    return `/${targetName}`;
  }
}
