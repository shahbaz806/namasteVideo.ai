import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { provisionUser } from '../apps/web/lib/auth/admission';
import { getDb, closeMongoClient } from '../apps/web/lib/db/client';
import { COLLECTIONS } from '../apps/web/lib/db/schema';
import { GET as listProjectsRoute, POST as createProjectRoute } from '../apps/web/app/api/projects/route';
import {
  GET as getProjectRoute,
  PATCH as patchProjectRoute,
  DELETE as deleteProjectRoute,
} from '../apps/web/app/api/projects/[id]/route';

let userA: { id: string; email: string };
let userB: { id: string; email: string };

before(async () => {
  const timestamp = Date.now();
  const provA = await provisionUser({
    email: `creator-a-${timestamp}@example.com`,
    password: 'SecurePasswordA123!',
    name: 'Creator A',
    operatorRef: 'test-f05-a',
  });
  userA = { id: provA.userId, email: provA.email };

  const provB = await provisionUser({
    email: `creator-b-${timestamp}@example.com`,
    password: 'SecurePasswordB123!',
    name: 'Creator B',
    operatorRef: 'test-f05-b',
  });
  userB = { id: provB.userId, email: provB.email };
});

after(async () => {
  await closeMongoClient();
});

test('POST /api/projects creates project with blank draft and conversation', async () => {
  const idempKey = `idemp_${crypto.randomBytes(16).toString('hex')}`;
  const req = new NextRequest('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempKey,
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify({ title: 'Explaining QuickSort' }),
  });

  const res = await createProjectRoute(req);
  assert.equal(res.status, 201);
  const location = res.headers.get('location');
  assert.ok(location?.startsWith('/api/projects/prj_'));

  const json = await res.json();
  assert.ok(json.data.id.startsWith('prj_'));
  assert.equal(json.data.title, 'Explaining QuickSort');
  assert.equal(json.data.revision, 1);
  assert.equal(json.data.draftRevision, 1);
  assert.equal(json.data.flags.drafts, true);
  assert.equal(json.data.flags.ready, false);
  assert.ok(json.meta.requestId);

  // Verify associated draft and conversation exist in DB
  const db = await getDb();
  const draft = await db.collection(COLLECTIONS.DRAFTS).findOne({ projectId: json.data.id });
  assert.ok(draft);
  assert.equal(draft.ownerId, userA.id);
  assert.equal(draft.revision, 1);
  assert.equal(draft.voicePreset, 'daniel-test');

  const conv = await db.collection(COLLECTIONS.CONVERSATIONS).findOne({ projectId: json.data.id });
  assert.ok(conv);
  assert.equal(conv.ownerId, userA.id);
  assert.equal(conv.kind, 'project');
});

test('POST /api/projects defaults title to "Untitled video" and enforces validation', async () => {
  const idempKey = `idemp_${crypto.randomBytes(16).toString('hex')}`;
  const req = new NextRequest('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempKey,
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify({}),
  });

  const res = await createProjectRoute(req);
  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.data.title, 'Untitled video');

  // Reject unknown fields
  const invalidReq = new NextRequest('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `idemp_${crypto.randomBytes(16).toString('hex')}`,
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify({ title: 'Valid', unknownField: 'hacked' }),
  });
  const invalidRes = await createProjectRoute(invalidReq);
  assert.equal(invalidRes.status, 422);

  // Missing idempotency key
  const noKeyReq = new NextRequest('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify({ title: 'No Key' }),
  });
  const noKeyRes = await createProjectRoute(noKeyReq);
  assert.equal(noKeyRes.status, 422);
});

test('POST /api/projects idempotency replay and key reuse conflict', async () => {
  const idempKey = `idemp_${crypto.randomBytes(16).toString('hex')}`;
  const originalBody = { title: 'Idempotency Demo' };

  // Initial call
  const req1 = new NextRequest('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempKey,
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify(originalBody),
  });
  const res1 = await createProjectRoute(req1);
  assert.equal(res1.status, 201);
  const json1 = await res1.json();

  // Replay with exact same body and key
  const req2 = new NextRequest('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempKey,
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify(originalBody),
  });
  const res2 = await createProjectRoute(req2);
  assert.equal(res2.status, 201);
  assert.equal(res2.headers.get('idempotency-replayed'), 'true');
  const json2 = await res2.json();
  assert.equal(json2.data.id, json1.data.id);

  // Different body with same key -> 409 IDEMPOTENCY_KEY_REUSED
  const req3 = new NextRequest('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempKey,
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify({ title: 'Completely Different Title' }),
  });
  const res3 = await createProjectRoute(req3);
  assert.equal(res3.status, 409);
  const json3 = await res3.json();
  assert.equal(json3.error.code, 'IDEMPOTENCY_KEY_REUSED');
});

test('GET /api/projects pagination and cursor validation', async () => {
  // Create 3 projects for User A
  for (let i = 1; i <= 3; i++) {
    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `idemp_${crypto.randomBytes(16).toString('hex')}`,
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({ title: `Batch Project ${i}` }),
    });
    await createProjectRoute(req);
  }

  // Fetch with limit=2
  const listReq1 = new NextRequest('http://localhost:3000/api/projects?limit=2', {
    headers: { 'x-test-user-id': userA.id },
  });
  const listRes1 = await listProjectsRoute(listReq1);
  assert.equal(listRes1.status, 200);
  const page1 = await listRes1.json();
  assert.equal(page1.data.length, 2);
  assert.equal(page1.page.hasMore, true);
  assert.ok(page1.page.nextCursor);

  // Fetch page 2 with cursor
  const listReq2 = new NextRequest(
    `http://localhost:3000/api/projects?limit=2&cursor=${encodeURIComponent(page1.page.nextCursor)}`,
    {
      headers: { 'x-test-user-id': userA.id },
    }
  );
  const listRes2 = await listProjectsRoute(listReq2);
  assert.equal(listRes2.status, 200);
  const page2 = await listRes2.json();
  assert.ok(page2.data.length >= 1);

  // Tampered cursor -> 400 INVALID_CURSOR
  const badCursorReq = new NextRequest(
    'http://localhost:3000/api/projects?cursor=invalid_tampered_cursor.12345',
    {
      headers: { 'x-test-user-id': userA.id },
    }
  );
  const badCursorRes = await listProjectsRoute(badCursorReq);
  assert.equal(badCursorRes.status, 400);
  const badJson = await badCursorRes.json();
  assert.equal(badJson.error.code, 'INVALID_CURSOR');

  // Cross-user cursor -> 400 INVALID_CURSOR
  const crossUserReq = new NextRequest(
    `http://localhost:3000/api/projects?cursor=${encodeURIComponent(page1.page.nextCursor)}`,
    {
      headers: { 'x-test-user-id': userB.id },
    }
  );
  const crossUserRes = await listProjectsRoute(crossUserReq);
  assert.equal(crossUserRes.status, 400);
  const crossJson = await crossUserRes.json();
  assert.equal(crossJson.error.code, 'INVALID_CURSOR');
});

test('Ownership isolation: User B cannot access, rename, or delete User A projects', async () => {
  // Create project under User A
  const createReq = new NextRequest('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `idemp_${crypto.randomBytes(16).toString('hex')}`,
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify({ title: 'Top Secret A' }),
  });
  const createRes = await createProjectRoute(createReq);
  const { data: project } = await createRes.json();
  const projectId = project.id;

  // 1. User B GET -> 404 NOT_FOUND
  const getReq = new NextRequest(`http://localhost:3000/api/projects/${projectId}`, {
    headers: { 'x-test-user-id': userB.id },
  });
  const getRes = await getProjectRoute(getReq, { params: Promise.resolve({ id: projectId }) });
  assert.equal(getRes.status, 404);

  // 2. User B PATCH -> 404 NOT_FOUND
  const patchReq = new NextRequest(`http://localhost:3000/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-test-user-id': userB.id,
    },
    body: JSON.stringify({ expectedRevision: 1, title: 'Hacked by B' }),
  });
  const patchRes = await patchProjectRoute(patchReq, { params: Promise.resolve({ id: projectId }) });
  assert.equal(patchRes.status, 404);

  // 3. User B DELETE -> 404 NOT_FOUND
  const deleteReq = new NextRequest(`http://localhost:3000/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `idemp_${crypto.randomBytes(16).toString('hex')}`,
      'x-test-user-id': userB.id,
    },
    body: JSON.stringify({ expectedRevision: 1, confirm: true }),
  });
  const deleteRes = await deleteProjectRoute(deleteReq, { params: Promise.resolve({ id: projectId }) });
  assert.equal(deleteRes.status, 404);

  // 4. User B list does NOT include User A's project
  const listBReq = new NextRequest('http://localhost:3000/api/projects', {
    headers: { 'x-test-user-id': userB.id },
  });
  const listBRes = await listProjectsRoute(listBReq);
  const listBJson = await listBRes.json();
  const found = listBJson.data.some((p: any) => p.id === projectId);
  assert.equal(found, false);
});

test('PATCH /api/projects/:id updates title and handles CAS revision conflict', async () => {
  // Create project under User A
  const createReq = new NextRequest('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `idemp_${crypto.randomBytes(16).toString('hex')}`,
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify({ title: 'Initial Name' }),
  });
  const createRes = await createProjectRoute(createReq);
  const { data: project } = await createRes.json();
  const projectId = project.id;
  assert.equal(project.revision, 1);

  // Update with expectedRevision = 1
  const patchReq1 = new NextRequest(`http://localhost:3000/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify({ expectedRevision: 1, title: 'Renamed Name' }),
  });
  const patchRes1 = await patchProjectRoute(patchReq1, { params: Promise.resolve({ id: projectId }) });
  assert.equal(patchRes1.status, 200);
  const patchJson1 = await patchRes1.json();
  assert.equal(patchJson1.data.title, 'Renamed Name');
  assert.equal(patchJson1.data.revision, 2);

  // Stale update with expectedRevision = 1 -> 409 REVISION_CONFLICT
  const patchReq2 = new NextRequest(`http://localhost:3000/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify({ expectedRevision: 1, title: 'Conflicting Name' }),
  });
  const patchRes2 = await patchProjectRoute(patchReq2, { params: Promise.resolve({ id: projectId }) });
  assert.equal(patchRes2.status, 409);
  const patchJson2 = await patchRes2.json();
  assert.equal(patchJson2.error.code, 'REVISION_CONFLICT');
  assert.equal(patchJson2.error.details.currentRevision, 2);
  assert.equal(patchJson2.error.details.reloadUrl, `/api/projects/${projectId}`);
});

test('DELETE /api/projects/:id soft-deletes project and creates cleanup job', async () => {
  // Create project under User A
  const createReq = new NextRequest('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `idemp_${crypto.randomBytes(16).toString('hex')}`,
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify({ title: 'To Be Deleted' }),
  });
  const createRes = await createProjectRoute(createReq);
  const { data: project } = await createRes.json();
  const projectId = project.id;
  const deleteIdempKey = `idemp_${crypto.randomBytes(16).toString('hex')}`;

  // Stale expectedRevision -> 409
  const staleDeleteReq = new NextRequest(`http://localhost:3000/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': deleteIdempKey,
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify({ expectedRevision: 999, confirm: true }),
  });
  const staleRes = await deleteProjectRoute(staleDeleteReq, { params: Promise.resolve({ id: projectId }) });
  assert.equal(staleRes.status, 409);

  // Valid delete
  const validDeleteReq = new NextRequest(`http://localhost:3000/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': deleteIdempKey,
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify({ expectedRevision: 1, confirm: true }),
  });
  const validDeleteRes = await deleteProjectRoute(validDeleteReq, { params: Promise.resolve({ id: projectId }) });
  assert.equal(validDeleteRes.status, 202);
  const deleteJson = await validDeleteRes.json();
  assert.ok(deleteJson.data.jobId.startsWith('job_'));
  assert.equal(deleteJson.data.resource.id, projectId);
  assert.equal(deleteJson.data.state, 'queued');

  // Verify project is no longer returned via GET
  const getReq = new NextRequest(`http://localhost:3000/api/projects/${projectId}`, {
    headers: { 'x-test-user-id': userA.id },
  });
  const getRes = await getProjectRoute(getReq, { params: Promise.resolve({ id: projectId }) });
  assert.equal(getRes.status, 404);

  // Replaying DELETE with same idempotency key returns 202 replay
  const replayDeleteReq = new NextRequest(`http://localhost:3000/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': deleteIdempKey,
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify({ expectedRevision: 1, confirm: true }),
  });
  const replayRes = await deleteProjectRoute(replayDeleteReq, { params: Promise.resolve({ id: projectId }) });
  assert.equal(replayRes.status, 202);
  assert.equal(replayRes.headers.get('idempotency-replayed'), 'true');
});
