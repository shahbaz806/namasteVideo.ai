import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { provisionUser } from '../apps/web/lib/auth/admission';
import { getDb, closeMongoClient } from '../apps/web/lib/db/client';
import { COLLECTIONS } from '../apps/web/lib/db/schema';
import { POST as createProjectRoute } from '../apps/web/app/api/projects/route';
import { POST as postRenderRoute } from '../apps/web/app/api/projects/[id]/render/route';
import { GET as getRenderJobRoute } from '../apps/web/app/api/render/[jobId]/route';
import { getRenderJob } from '../apps/web/lib/db/repositories/renderJob';

let user: { id: string; email: string };
let projectId: string;

function randomIdempKey() {
  return `idemp_${crypto.randomUUID()}`;
}

before(async () => {
  await getDb();
  const timestamp = Date.now();
  const prov = await provisionUser({
    email: `render-tester-${timestamp}@example.com`,
    password: 'SecurePassword123!',
    name: 'Render Tester',
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
    body: JSON.stringify({ title: 'Render Job Test' }),
  });
  const res = await createProjectRoute(req);
  assert.equal(res.status, 201);
  const json = await res.json();
  projectId = json.data.id;
});

after(async () => {
  // Allow simulated render timers to settle
  await new Promise((resolve) => setTimeout(resolve, 6000));
  try {
    const db = await getDb();
    await db.collection(COLLECTIONS.RENDER_JOBS).deleteMany({ projectId });
    await db.collection(COLLECTIONS.PROJECTS).deleteMany({ _id: projectId as any });
  } catch {
    // cleanup
  }
  await closeMongoClient();
});

describe('F10: Video Rendering & Export API', () => {
  let createdJobId: string;

  test('1. POST /api/projects/:id/render creates render job and returns 202', async () => {
    const req = new NextRequest(`http://localhost:3000/api/projects/${projectId}/render`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': user.id,
      },
    });

    const res = await postRenderRoute(req, { params: Promise.resolve({ id: projectId }) });
    assert.equal(res.status, 202);
    const json = await res.json();
    assert.ok(json.jobId);
    createdJobId = json.jobId;

    // Verify stored in DB
    const job = await getRenderJob(createdJobId);
    assert.ok(job);
    assert.equal(job.projectId.toString(), projectId);
  });

  test('2. GET /api/render/:jobId returns render job details', async () => {
    const req = new NextRequest(`http://localhost:3000/api/render/${createdJobId}`, {
      method: 'GET',
      headers: {
        'x-test-user-id': user.id,
      },
    });

    const res = await getRenderJobRoute(req, { params: Promise.resolve({ jobId: createdJobId }) });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.status);
    assert.match(json.status, /queued|running|completed/);
  });

  test('3. GET /api/render/:jobId returns 404 for unknown job ID', async () => {
    const fakeJobId = '654321654321654321654321';
    const req = new NextRequest(`http://localhost:3000/api/render/${fakeJobId}`, {
      method: 'GET',
      headers: {
        'x-test-user-id': user.id,
      },
    });

    const res = await getRenderJobRoute(req, { params: Promise.resolve({ jobId: fakeJobId }) });
    assert.equal(res.status, 404);
  });
});
