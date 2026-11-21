import { NextResponse } from 'next/server';
import { getStoryboard, replaceStoryboard } from '../../../../lib/db/repositories/storyboard';
import { createStoryboardJob } from '../../../../lib/db/repositories/jobs';
import { verifyOwnerAndProject } from '../../../../lib/api/auth';
import type { AcceptedOperation } from '../../../../lib/api';

/** GET /api/projects/:id/storyboard – fetch current storyboard */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id: projectId } = params;
  const ownerId = await verifyOwnerAndProject(request, projectId);
  const storyboard = await getStoryboard(projectId, ownerId);
  return NextResponse.json(storyboard ?? { frames: [] }, { status: 200 });
}

/** POST /api/projects/:id/storyboard – start storyboard generation job */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { id: projectId } = params;
  const ownerId = await verifyOwnerAndProject(request, projectId);
  const { prompt, expectedDraftRevision, idempotencyKey } = await request.json();
  const requestHash = JSON.stringify({ prompt, expectedDraftRevision, idempotencyKey });

  const result = await createStoryboardJob({
    ownerId,
    projectId,
    prompt,
    expectedDraftRevision,
    idempotencyKey,
    requestHash,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: 400 });
  }

  // Update project with new storyboard jobId if needed – omitted for brevity
  return NextResponse.json(result.operation as AcceptedOperation, { status: 202 });
}
