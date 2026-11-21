import { NextRequest, NextResponse } from 'next/server';
import { verifyOwnerAndProject } from '@/app/api/_auth';
import { addStoryboardFrame, removeStoryboardFrame, reorderStoryboardFrames } from '@/lib/db/repositories/storyboard';
import { Types } from 'mongoose';

/**
 * POST /api/projects/[id]/storyboard/frame
 *   Adds a new frame to the storyboard.
 *   Body: { imageUrl: string, caption?: string, order?: number }
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { project } = await verifyOwnerAndProject(request, params.id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const body = await request.json();
  const { imageUrl, caption, order } = body;
  if (!imageUrl) {
    return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });
  }

  const frame = await addStoryboardFrame(project._id, {
    imageUrl,
    caption: caption ?? '',
    order: order ?? undefined,
  });

  return NextResponse.json(frame);
}

/**
 * DELETE /api/projects/[id]/storyboard/frame
 *   Removes a frame from the storyboard.
 *   Body: { frameId: string }
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { project } = await verifyOwnerAndProject(request, params.id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const { frameId } = await request.json();
  if (!frameId) {
    return NextResponse.json({ error: 'frameId required' }, { status: 400 });
  }

  await removeStoryboardFrame(project._id, frameId);
  return NextResponse.json({ success: true });
}

/**
 * POST /api/projects/[id]/storyboard/frame/reorder
 *   Reorders frames based on an ordered array of frame IDs.
 *   Body: { orderedIds: string[] }
 */
export async function POST_reorder(request: NextRequest, { params }: { params: { id: string } }) {
  const { project } = await verifyOwnerAndProject(request, params.id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const { orderedIds } = await request.json();
  if (!Array.isArray(orderedIds)) {
    return NextResponse.json({ error: 'orderedIds must be an array' }, { status: 400 });
  }

  await reorderStoryboardFrames(project._id, orderedIds.map(id => Types.ObjectId(id)));
  return NextResponse.json({ success: true });
}
