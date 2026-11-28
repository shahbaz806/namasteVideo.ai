import { NextRequest } from 'next/server';
import { verifyMediaGrant } from '@/lib/storage/mediaGrants';
import { storageAdapter } from '@/lib/storage/r2';

interface RouteContext {
  params: Promise<{ grantToken: string }>;
}

function parseRangeHeader(
  rangeHeader: string,
  totalBytes: number
): { start: number; end: number } | 'malformed' | 'unsatisfiable' {
  if (!rangeHeader.startsWith('bytes=')) {
    return 'malformed';
  }

  const rangeSpec = rangeHeader.slice(6).trim();
  // Only single range supported (reject multiple ranges with comma)
  if (rangeSpec.includes(',')) {
    return 'unsatisfiable';
  }

  const hyphenIndex = rangeSpec.indexOf('-');
  if (hyphenIndex === -1) {
    return 'malformed';
  }

  const startStr = rangeSpec.slice(0, hyphenIndex).trim();
  const endStr = rangeSpec.slice(hyphenIndex + 1).trim();

  let start: number;
  let end: number;

  if (startStr === '') {
    // Suffix range: -N means last N bytes
    const suffix = parseInt(endStr, 10);
    if (isNaN(suffix) || suffix <= 0) return 'malformed';
    start = Math.max(0, totalBytes - suffix);
    end = totalBytes - 1;
  } else if (endStr === '') {
    // Prefix range: N- means from byte N to end
    start = parseInt(startStr, 10);
    if (isNaN(start) || start < 0) return 'malformed';
    end = totalBytes - 1;
  } else {
    // Closed range: N-M
    start = parseInt(startStr, 10);
    end = parseInt(endStr, 10);
    if (isNaN(start) || isNaN(end) || start < 0 || end < start) {
      return 'malformed';
    }
  }

  if (start >= totalBytes || end >= totalBytes) {
    return 'unsatisfiable';
  }

  return { start, end };
}

export async function GET(req: NextRequest, context: RouteContext) {
  return handleMediaRequest(req, context, false);
}

export async function HEAD(req: NextRequest, context: RouteContext) {
  return handleMediaRequest(req, context, true);
}

async function handleMediaRequest(req: NextRequest, context: RouteContext, isHead: boolean) {
  const { grantToken } = await context.params;

  // 1. Verify grant, expiration, revocation, project tombstone, and asset readiness
  const verified = await verifyMediaGrant(grantToken);
  if (!verified) {
    // Generic 404 for expired/revoked/unknown grants or deleted projects
    return new Response('Not Found', { status: 404 });
  }

  const { grant, asset } = verified;

  // 2. Fetch object from private storage
  const object = await storageAdapter.getObject(asset.objectKey);
  if (!object) {
    // Missing R2 asset returns 404
    return new Response('Not Found', { status: 404 });
  }

  const totalBytes = object.bytes;
  const contentType = asset.contentType || object.contentType || 'application/octet-stream';

  // Build Content-Disposition
  const filename = `${asset._id}.${asset.objectKey.split('.').pop() || 'bin'}`;
  const disposition = grant.purpose === 'download' ? `attachment; filename="${filename}"` : 'inline';

  const baseHeaders: Record<string, string> = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'Content-Disposition': disposition,
  };

  // 3. Handle Range requests
  const rangeHeader = req.headers.get('range');
  if (rangeHeader) {
    const parsed = parseRangeHeader(rangeHeader, totalBytes);

    if (parsed === 'malformed' || parsed === 'unsatisfiable') {
      return new Response(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes */${totalBytes}`,
        },
      });
    }

    const { start, end } = parsed;
    const chunkSize = end - start + 1;
    const chunk = object.data.subarray(start, end + 1);

    const rangeHeaders: Record<string, string> = {
      ...baseHeaders,
      'Content-Range': `bytes ${start}-${end}/${totalBytes}`,
      'Content-Length': String(chunkSize),
    };

    if (isHead) {
      return new Response(null, { status: 206, headers: rangeHeaders });
    }

    return new Response(new Uint8Array(chunk), { status: 206, headers: rangeHeaders });
  }

  // 4. Full Content (200 OK)
  const fullHeaders: Record<string, string> = {
    ...baseHeaders,
    'Content-Length': String(totalBytes),
  };

  if (isHead) {
    return new Response(null, { status: 200, headers: fullHeaders });
  }

  return new Response(new Uint8Array(object.data), { status: 200, headers: fullHeaders });
}
