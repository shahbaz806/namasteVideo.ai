import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session-guard';
import { createErrorResponse } from '@/lib/api';
import { getAssetById } from '@/lib/db/repositories/assets';
import { createMediaGrant } from '@/lib/storage/mediaGrants';
import { MediaGrantPurpose } from '@/lib/db/schema';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ALLOWED_PURPOSES: MediaGrantPurpose[] = [
  'preview',
  'download',
  'ingest',
  'render_input',
  'render_output',
  'voice_sample',
];

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (auth.errorResponse) return auth.errorResponse;

  const { user, requestId } = auth;
  const { id: assetId } = await context.params;

  if (!assetId || typeof assetId !== 'string') {
    return createErrorResponse('VALIDATION_ERROR', 'Invalid asset ID', requestId, 400);
  }

  // Parse body if present
  let body: Record<string, any> = {};
  try {
    const text = await req.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    return createErrorResponse('INVALID_JSON', 'Malformed request body', requestId, 400);
  }

  const purpose: MediaGrantPurpose = body?.purpose ?? 'preview';
  if (!ALLOWED_PURPOSES.includes(purpose)) {
    return createErrorResponse(
      'VALIDATION_ERROR',
      `Invalid purpose: must be one of ${ALLOWED_PURPOSES.join(', ')}`,
      requestId,
      400
    );
  }

  const asset = await getAssetById(assetId);
  if (!asset || asset.ownerId !== user.id) {
    return createErrorResponse('NOT_FOUND', 'Asset not found', requestId, 404);
  }

  if (asset.state !== 'ready') {
    return createErrorResponse('ASSET_NOT_READY', 'Asset is still being processed', requestId, 422);
  }

  try {
    const grant = await createMediaGrant({
      ownerId: user.id,
      projectId: asset.projectId,
      assetId: asset._id,
      purpose,
      lifetimeSeconds: typeof body?.lifetimeSeconds === 'number' ? body.lifetimeSeconds : 600,
    });

    return Response.json(
      {
        url: grant.url,
        expiresAt: grant.expiresAt.toISOString(),
        contentType: grant.contentType,
        bytes: grant.bytes,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Failed to create media access grant:', err);
    if (err?.message === 'PROJECT_NOT_FOUND_OR_DELETED' || err?.message === 'ASSET_NOT_FOUND') {
      return createErrorResponse('NOT_FOUND', 'Asset not found or project deleted', requestId, 404);
    }
    if (err?.message === 'ASSET_NOT_READY') {
      return createErrorResponse('ASSET_NOT_READY', 'Asset is not ready', requestId, 422);
    }
    return createErrorResponse('INTERNAL_ERROR', 'Failed to generate asset access URL', requestId, 500);
  }
}
