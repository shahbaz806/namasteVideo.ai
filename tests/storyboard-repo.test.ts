import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getStoryboard, addStoryboardFrame, removeStoryboardFrame, reorderStoryboardFrames } from '../../apps/web/lib/db/repositories/storyboard';
import { connectTestDb, disconnectTestDb } from '../../apps/web/lib/db/test-utils';
import { Types } from 'mongoose';

describe('Storyboard repository', async () => {
  await connectTestDb();
  const projectId = '64b5f2c5e6f0d8a7b2c9d123';

  it('should add a frame', async () => {
    const frame = await addStoryboardFrame(projectId, { imageUrl: 'https://example.com/img.png', caption: 'Test', order: 0 });
    assert.ok(frame);
    assert.strictEqual(frame.imageUrl, 'https://example.com/img.png');
  });

  it('should get storyboard with frame', async () => {
    const sb = await getStoryboard(projectId);
    assert.ok(sb?.frames?.length > 0);
  });

  it('should reorder frames', async () => {
    const sb = await getStoryboard(projectId);
    const ids = sb?.frames?.map(f => f._id.toString()) ?? [];
    await reorderStoryboardFrames(projectId, ids.reverse().map(id => new Types.ObjectId(id)));
    const reordered = await getStoryboard(projectId);
    assert.strictEqual(reordered?.frames?.[0]?._id.toString(), ids[ids.length - 1]);
  });

  it('should remove a frame', async () => {
    const sb = await getStoryboard(projectId);
    const frameId = sb?.frames?.[0]?._id.toString();
    if (frameId) {
      await removeStoryboardFrame(projectId, frameId);
      const after = await getStoryboard(projectId);
      assert.ok(!after?.frames?.some(f => f._id.toString() === frameId));
    }
  });

  await disconnectTestDb();
});