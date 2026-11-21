import { put } from '@vercel/blob';
import fs from 'fs';
import path from 'path';

/**
 * Upload a local file to Vercel Blob storage and return the public URL.
 * The caller should provide a destination path (e.g., `render/<jobId>/video.mp4`).
 */
export async function upload(filePath: string, destination: string): Promise<string> {
  const fileBuffer = await fs.promises.readFile(filePath);
  const mime = destination.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
  const blob = await put(destination, fileBuffer, { access: 'public', contentType: mime });
  return blob.url;
}
