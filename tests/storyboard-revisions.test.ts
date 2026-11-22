import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { provisionUser } from '../apps/web/lib/auth/admission';
import { getDb, closeMongoClient } from '../apps/web/lib/db/client';
import { COLLECTIONS } from '../apps/web/lib/db/schema';
import { POST as createProjectRoute } from '../apps/web/app/api/projects/route';
import {
  GET as getStoryboardRoute,
  POST as postStoryboardRoute,
} from '../apps/web/app/api/projects/[id]/storyboard/route';
import {
  GET as getRevisionsRoute,
  POST as postRevisionsRoute,
} from '../apps/web/app/api/projects/[id]/revisions/route';
import { POST as restoreRevisionRoute } from '../apps/web/app/api/projects/[id]/revisions/restore/route';
import { POST as approveStoryboardRoute } from '../apps/web/app/api/projects/[id]/storyboard/approve/route';
import {
  addStoryboardFrame,
  getStoryboard,
  listStoryboardVersions,
} from '../apps/web/lib/db/repositories/storyboard';

let user: { id: string; email: string };
let projectId: string;

function randomIdempKey() {
  return `idemp_${crypto.randomUUID()}`;
}

before(async () => {
  await getDb();
  const timestamp = Date.now();
  const prov = await provisionUser({
    email: `storyboard-tester-${timestamp}@example.com`,
    password: 'SecurePassword123!',
    name: 'Storyboard Tester',
    operatorRef: 'test-runner',
  });
  user = { id: prov.userId, email: prov.email };

  // Create test project
  const req = new NextRequest('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomIdempKey(),
      'x-test-user-id': user.id,
    },
    body: JSON.stringify({ title: 'Storyboard Revision Test' }),
  });
  const res = await createProjectRoute(req);
  assert.equal(res.status, 201);
  const json = await res.json();
  projectId = json.data.id;
});

after(async () => {
  try {
    const db = await getDb();
    await db.collection(COLLECTIONS.STORYBOARDS).deleteMany({ projectId });
    await db.collection(COLLECTIONS.APPROVALS).deleteMany({ projectId });
    await db.collection(COLLECTIONS.PROJECTS).deleteMany({ _id: projectId as any });
  } catch {
    // cleanup
  }
  await closeMongoClient();
});

describe('F11: Conversational Storyboard Revisions and Approval', () => {
  let initialStoryboardId: string;
  let revisionStoryboardId: string;

  test('1. Creates initial storyboard version (v1)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/projects/${projectId}/storyboard`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': user.id,
      },
      body: JSON.stringify({ prompt: 'Explain quantum computing in 3 scenes' }),
    });

    const res = await postStoryboardRoute(req, { params: Promise.resolve({ id: projectId }) });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.version, 1);
    assert.equal(json.data.state, 'review_ready');
    assert.equal(json.data.frames.length, 3);
    assert.ok(json.data._id);
    initialStoryboardId = String(json.data._id);
  });

  test('2. Submits a conversational revision instruction (v2)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/projects/${projectId}/revisions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': user.id,
      },
      body: JSON.stringify({
        instruction: 'Make the narration more punchy and energetic for a TikTok audience',
      }),
    });

    const res = await postRevisionsRoute(req, { params: Promise.resolve({ id: projectId }) });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.data.version, 2);
    assert.equal(json.data.parentId, initialStoryboardId);
    assert.equal(json.data.state, 'review_ready');
    assert.equal(
      json.data.changeSummary,
      'Make the narration more punchy and energetic for a TikTok audience'
    );
    assert.ok(json.data.changedSceneIds.length > 0);
    revisionStoryboardId = String(json.data._id);
  });

  test('3. Lists all storyboard revisions sorted descending by version', async () => {
    const req = new NextRequest(`http://localhost:3000/api/projects/${projectId}/revisions`, {
      method: 'GET',
      headers: { 'x-test-user-id': user.id },
    });

    const res = await getRevisionsRoute(req, { params: Promise.resolve({ id: projectId }) });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(Array.isArray(json.data));
    assert.equal(json.data.length, 2);
    assert.equal(json.data[0].version, 2);
    assert.equal(json.data[1].version, 1);
  });

  test('4. Restores earlier version 1 as a new working revision (v3)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/projects/${projectId}/revisions/restore`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': user.id,
      },
      body: JSON.stringify({ targetVersionId: initialStoryboardId }),
    });

    const res = await restoreRevisionRoute(req, { params: Promise.resolve({ id: projectId }) });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.version, 3);
    assert.equal(json.data.parentId, initialStoryboardId);
    assert.equal(json.data.changeSummary, 'Restored from version 1');
  });

  test('5. Approves the storyboard and creates an immutable approval record', async () => {
    const req = new NextRequest(`http://localhost:3000/api/projects/${projectId}/storyboard/approve`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': user.id,
      },
      body: JSON.stringify({}),
    });

    const res = await approveStoryboardRoute(req, { params: Promise.resolve({ id: projectId }) });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.storyboard.state, 'approved');
    assert.ok(json.data.storyboard.approvalId);
    assert.equal(json.data.approval.kind, 'story');
    assert.equal(json.data.approval.subjectId, String(json.data.storyboard._id));
    assert.equal(json.data.approval.approvedBy, user.id);

    // Verify approval persisted in DB
    const db = await getDb();
    const storedApproval = await db.collection(COLLECTIONS.APPROVALS).findOne({
      _id: json.data.storyboard.approvalId as any,
    });
    assert.ok(storedApproval);
    assert.equal(storedApproval.kind, 'story');
  });

  test('6. Rejects direct modification on an approved storyboard', async () => {
    await assert.rejects(
      async () => {
        await addStoryboardFrame(projectId, user.id, {
          imageUrl: 'https://placehold.co/600x400',
          caption: 'Direct edit',
          order: 99,
        });
      },
      {
        message: 'Cannot directly modify an approved storyboard; create a revision instead.',
      }
    );
  });
});
