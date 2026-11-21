import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { provisionUser } from '../apps/web/lib/auth/admission';
import { getDb, closeMongoClient } from '../apps/web/lib/db/client';
import { COLLECTIONS, ProjectDocument } from '../apps/web/lib/db/schema';
import { POST as createProjectRoute } from '../apps/web/app/api/projects/route';
import {
  GET as getDraftRoute,
  PATCH as patchDraftRoute,
} from '../apps/web/app/api/projects/[id]/draft/route';
import { DELETE as deleteProjectRoute } from '../apps/web/app/api/projects/[id]/route';
import type { DraftView } from '../apps/web/lib/db/repositories/drafts';

let userA: { id: string; email: string };
let userB: { id: string; email: string };

function randomIdempKey() {
  return `idemp_${crypto.randomUUID()}`;
}

async function createProjectForUser(userId: string, title = 'Test Draft Project') {
  const req = new NextRequest('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomIdempKey(),
      'x-test-user-id': userId,
    },
    body: JSON.stringify({ title }),
  });
  const res = await createProjectRoute(req);
  assert.equal(res.status, 201);
  const json = await res.json();
  return json.data as { id: string; revision: number; draftRevision: number };
}

before(async () => {
  await getDb();
  const timestamp = Date.now();
  const provA = await provisionUser({
    email: `draft-tester-a-${timestamp}@example.com`,
    password: 'SecurePasswordA123!',
    name: 'Draft User A',
    operatorRef: 'test-f07-a',
  });
  userA = { id: provA.userId, email: provA.email };

  const provB = await provisionUser({
    email: `draft-tester-b-${timestamp}@example.com`,
    password: 'SecurePasswordB123!',
    name: 'Draft User B',
    operatorRef: 'test-f07-b',
  });
  userB = { id: provB.userId, email: provB.email };
});

after(async () => {
  await closeMongoClient();
});

describe('F07 — Idea Draft API and Autosave', () => {

  test('GET /api/projects/:id/draft returns initial blank draft with validation issues', async () => {
    const project = await createProjectForUser(userA.id);

    const req = new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
      method: 'GET',
      headers: { 'x-test-user-id': userA.id },
    });
    const res = await getDraftRoute(req, { params: Promise.resolve({ id: project.id }) });
    assert.equal(res.status, 200);

    const json = await res.json();
    const draft = json.data as DraftView;
    assert.equal(draft.projectId, project.id);
    assert.equal(draft.revision, 1);
    assert.equal(draft.topic, '');
    assert.equal(draft.audience, '');
    assert.equal(draft.notes, '');
    assert.equal(draft.voicePreset, 'daniel-test');
    assert.equal(draft.editablePlan, null);
    assert.ok(draft.contentHash);
    assert.equal(draft.validation.valid, false, 'Initial empty topic is not valid to generate video');
    assert.ok(draft.validation.issues.some((i) => i.path === 'topic' && i.code === 'REQUIRED'));
  });

  test('GET /api/projects/:id/draft returns 404 for nonexistent or deleted project', async () => {
    // Nonexistent project
    const req1 = new NextRequest('http://localhost:3000/api/projects/prj_nonexistent/draft', {
      method: 'GET',
      headers: { 'x-test-user-id': userA.id },
    });
    const res1 = await getDraftRoute(req1, { params: Promise.resolve({ id: 'prj_nonexistent' }) });
    assert.equal(res1.status, 404);

    // Deleted project
    const project = await createProjectForUser(userA.id);
    const delReq = new NextRequest(`http://localhost:3000/api/projects/${project.id}`, {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomIdempKey(),
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({ expectedRevision: project.revision, confirm: true }),
    });
    const delRes = await deleteProjectRoute(delReq, { params: Promise.resolve({ id: project.id }) });
    assert.equal(delRes.status, 202);

    const req2 = new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
      method: 'GET',
      headers: { 'x-test-user-id': userA.id },
    });
    const res2 = await getDraftRoute(req2, { params: Promise.resolve({ id: project.id }) });
    assert.equal(res2.status, 404);
  });

  test('Ownership isolation: User B cannot access or modify User A draft', async () => {
    const project = await createProjectForUser(userA.id);

    // User B tries to GET User A's draft
    const getReq = new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
      method: 'GET',
      headers: { 'x-test-user-id': userB.id },
    });
    const getRes = await getDraftRoute(getReq, { params: Promise.resolve({ id: project.id }) });
    assert.equal(getRes.status, 404);

    // User B tries to PATCH User A's draft
    const patchReq = new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userB.id,
      },
      body: JSON.stringify({
        expectedRevision: 1,
        changes: { topic: 'Hijacked Topic' },
      }),
    });
    const patchRes = await patchDraftRoute(patchReq, { params: Promise.resolve({ id: project.id }) });
    assert.equal(patchRes.status, 404);
  });

  test('PATCH /api/projects/:id/draft updates topic/audience/notes/voice and increments revision', async () => {
    const project = await createProjectForUser(userA.id);

    const patchReq = new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({
        expectedRevision: 1,
        changes: {
          topic: 'How QuickSort Works with Visual Examples',
          audience: 'Computer Science Undergraduates',
          notes: 'Focus on in-place partitioning and recursive sub-arrays',
          voicePreset: 'indian-english-male',
        },
      }),
    });

    const patchRes = await patchDraftRoute(patchReq, { params: Promise.resolve({ id: project.id }) });
    assert.equal(patchRes.status, 200);

    const json = await patchRes.json();
    const draft = json.data as DraftView;
    assert.equal(draft.revision, 2);
    assert.equal(draft.topic, 'How QuickSort Works with Visual Examples');
    assert.equal(draft.audience, 'Computer Science Undergraduates');
    assert.equal(draft.notes, 'Focus on in-place partitioning and recursive sub-arrays');
    assert.equal(draft.voicePreset, 'indian-english-male');
    assert.equal(draft.validation.valid, true);
    assert.equal(draft.validation.issues.length, 0);

    // Verify parent project draftRevision is updated in database
    const db = await getDb();
    const updatedProject = await db.collection<ProjectDocument>(COLLECTIONS.PROJECTS).findOne({ _id: project.id });
    assert.equal(updatedProject?.draftRevision, 2);
  });

  test('Autosave allows empty strings and preserves input with issues', async () => {
    const project = await createProjectForUser(userA.id);

    // Save with empty topic (creator cleared the input during editing)
    const patchReq = new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({
        expectedRevision: 1,
        changes: {
          topic: '',
          notes: 'Some scratchpad ideas',
        },
      }),
    });

    const patchRes = await patchDraftRoute(patchReq, { params: Promise.resolve({ id: project.id }) });
    assert.equal(patchRes.status, 200, 'Empty topic should not fail HTTP request during autosave');

    const draft = (await patchRes.json()).data as DraftView;
    assert.equal(draft.revision, 2);
    assert.equal(draft.topic, '');
    assert.equal(draft.notes, 'Some scratchpad ideas');
    assert.equal(draft.validation.valid, false);
    assert.ok(draft.validation.issues.some((i) => i.path === 'topic' && i.code === 'REQUIRED'));
  });

  test('CAS conflict: stale expectedRevision returns 409 REVISION_CONFLICT with details', async () => {
    const project = await createProjectForUser(userA.id);

    // First save: 1 -> 2
    const req1 = new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({
        expectedRevision: 1,
        changes: { topic: 'Version 2 Topic' },
      }),
    });
    const res1 = await patchDraftRoute(req1, { params: Promise.resolve({ id: project.id }) });
    assert.equal(res1.status, 200);

    // Second save from a stale tab sending expectedRevision: 1
    const req2 = new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({
        expectedRevision: 1,
        changes: { topic: 'Stale Overwrite Attempt' },
      }),
    });
    const res2 = await patchDraftRoute(req2, { params: Promise.resolve({ id: project.id }) });
    assert.equal(res2.status, 409);

    const json = await res2.json();
    assert.equal(json.error.code, 'REVISION_CONFLICT');
    assert.equal(json.error.details.currentRevision, 2);
    assert.equal(json.error.details.reloadUrl, `/api/projects/${project.id}/draft`);

    // Verify draft was not overwritten
    const getReq = new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
      method: 'GET',
      headers: { 'x-test-user-id': userA.id },
    });
    const getRes = await getDraftRoute(getReq, { params: Promise.resolve({ id: project.id }) });
    const currentDraft = (await getRes.json()).data as DraftView;
    assert.equal(currentDraft.topic, 'Version 2 Topic');
    assert.equal(currentDraft.revision, 2);
  });

  test('Validation: rejects payload exceeding bounds or with unknown fields', async () => {
    const project = await createProjectForUser(userA.id);

    // Topic > 2,000 chars
    const resLongTopic = await patchDraftRoute(
      new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-user-id': userA.id },
        body: JSON.stringify({ expectedRevision: 1, changes: { topic: 'a'.repeat(2001) } }),
      }),
      { params: Promise.resolve({ id: project.id }) }
    );
    assert.equal(resLongTopic.status, 422);

    // Audience > 200 chars
    const resLongAudience = await patchDraftRoute(
      new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-user-id': userA.id },
        body: JSON.stringify({ expectedRevision: 1, changes: { audience: 'a'.repeat(201) } }),
      }),
      { params: Promise.resolve({ id: project.id }) }
    );
    assert.equal(resLongAudience.status, 422);

    // Notes > 20,000 chars
    const resLongNotes = await patchDraftRoute(
      new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-user-id': userA.id },
        body: JSON.stringify({ expectedRevision: 1, changes: { notes: 'a'.repeat(20001) } }),
      }),
      { params: Promise.resolve({ id: project.id }) }
    );
    assert.equal(resLongNotes.status, 422);

    // Empty changes
    const resEmptyChanges = await patchDraftRoute(
      new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-user-id': userA.id },
        body: JSON.stringify({ expectedRevision: 1, changes: {} }),
      }),
      { params: Promise.resolve({ id: project.id }) }
    );
    assert.equal(resEmptyChanges.status, 422);

    // Unknown field in changes
    const resUnknownField = await patchDraftRoute(
      new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-user-id': userA.id },
        body: JSON.stringify({ expectedRevision: 1, changes: { unknownProp: 'bad' } }),
      }),
      { params: Promise.resolve({ id: project.id }) }
    );
    assert.equal(resUnknownField.status, 422);
  });

  test('Voice validation: rejects invalid voice with 422 VOICE_UNAVAILABLE', async () => {
    const project = await createProjectForUser(userA.id);

    const patchReq = new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({
        expectedRevision: 1,
        changes: { voicePreset: 'unsupported-synthetic-voice' },
      }),
    });

    const patchRes = await patchDraftRoute(patchReq, { params: Promise.resolve({ id: project.id }) });
    assert.equal(patchRes.status, 422);
    const json = await patchRes.json();
    assert.equal(json.error.code, 'VOICE_UNAVAILABLE');
  });

  test('Stale plan detection: changing topic or voice marks planStale', async () => {
    const project = await createProjectForUser(userA.id);

    // First save an editablePlan
    const savePlanRes = await patchDraftRoute(
      new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-user-id': userA.id },
        body: JSON.stringify({
          expectedRevision: 1,
          changes: {
            topic: 'Initial Topic',
            voicePreset: 'daniel-test',
            editablePlan: {
              schemaVersion: 2,
              title: 'Initial Plan',
              voicePreset: 'daniel-test',
              scenes: [],
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: project.id }) }
    );
    assert.equal(savePlanRes.status, 200);

    // Now change the topic without re-supplying editablePlan
    const updateTopicRes = await patchDraftRoute(
      new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-user-id': userA.id },
        body: JSON.stringify({
          expectedRevision: 2,
          changes: { topic: 'Completely Different Topic' },
        }),
      }),
      { params: Promise.resolve({ id: project.id }) }
    );
    assert.equal(updateTopicRes.status, 200);
    const draft = (await updateTopicRes.json()).data as DraftView;
    assert.equal(draft.revision, 3);
    assert.ok(draft.validation.issues.some((i) => i.path === 'editablePlan' && i.code === 'PLAN_STALE'));

    // Re-supplying editablePlan resets staleness
    const freshPlanRes = await patchDraftRoute(
      new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-user-id': userA.id },
        body: JSON.stringify({
          expectedRevision: 3,
          changes: {
            editablePlan: {
              schemaVersion: 2,
              title: 'Fresh Plan',
              voicePreset: 'daniel-test',
              scenes: [],
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: project.id }) }
    );
    assert.equal(freshPlanRes.status, 200);
    const freshDraft = (await freshPlanRes.json()).data as DraftView;
    assert.equal(freshDraft.revision, 4);
    assert.equal(freshDraft.validation.issues.some((i) => i.code === 'PLAN_STALE'), false);
  });
});
