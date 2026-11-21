import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { provisionUser } from '../apps/web/lib/auth/admission';
import { getDb, closeMongoClient } from '../apps/web/lib/db/client';
import { POST as createProjectRoute } from '../apps/web/app/api/projects/route';
import { GET as getVoicesRoute } from '../apps/web/app/api/voices/route';
import { POST as brainstormRoute } from '../apps/web/app/api/projects/[id]/brainstorm/route';
import { GET as getJobRoute } from '../apps/web/app/api/jobs/[id]/route';
import {
  GET as getDraftRoute,
  PATCH as patchDraftRoute,
} from '../apps/web/app/api/projects/[id]/draft/route';
import IdeaPage, { metadata as ideaMetadata } from '../apps/web/app/projects/[id]/idea/page';
import ProjectLayout from '../apps/web/app/projects/[id]/layout';
import type { DraftView } from '../apps/web/lib/db/repositories/drafts';
import type { JobView } from '../apps/web/lib/db/repositories/jobs';

let userA: { id: string; email: string };
let userB: { id: string; email: string };

function randomIdempKey() {
  return `idemp_${crypto.randomUUID()}`;
}

async function createProjectForUser(userId: string, title = 'Idea Test Project') {
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
    email: `idea-tester-a-${timestamp}@example.com`,
    password: 'SecurePasswordA123!',
    name: 'Idea Tester A',
    operatorRef: 'test-f08-a',
  });
  userA = { id: provA.userId, email: provA.email };

  const provB = await provisionUser({
    email: `idea-tester-b-${timestamp}@example.com`,
    password: 'SecurePasswordB123!',
    name: 'Idea Tester B',
    operatorRef: 'test-f08-b',
  });
  userB = { id: provB.userId, email: provB.email };
});

after(async () => {
  await closeMongoClient();
});

describe('F08 — Idea and Brainstorming UI & Integration', () => {

  test('GET /api/voices returns auditioned voices with default preset', async () => {
    const req = new NextRequest('http://localhost:3000/api/voices', {
      method: 'GET',
      headers: { 'x-test-user-id': userA.id },
    });
    const res = await getVoicesRoute(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.data.defaultPreset, 'daniel-test');
    assert.ok(Array.isArray(json.data.voices));
    assert.equal(json.data.voices.length, 3);

    const presets = json.data.voices.map((v: { preset: string }) => v.preset);
    assert.ok(presets.includes('daniel-test'));
    assert.ok(presets.includes('indian-english-male'));
    assert.ok(presets.includes('indian-english-female'));

    const daniel = json.data.voices.find((v: { preset: string }) => v.preset === 'daniel-test');
    assert.equal(daniel.testOnly, true);
  });

  test('POST /api/projects/:id/brainstorm creates brainstorm job and returns 202', async () => {
    const project = await createProjectForUser(userA.id);
    const idempKey = randomIdempKey();

    const req = new NextRequest(`http://localhost:3000/api/projects/${project.id}/brainstorm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': idempKey,
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({
        expectedDraftRevision: 1,
        prompt: 'Binary Search Algorithm in 60 seconds',
      }),
    });

    const res = await brainstormRoute(req, { params: Promise.resolve({ id: project.id }) });
    assert.equal(res.status, 202);

    const json = await res.json();
    assert.ok(json.data.jobId.startsWith('job_'));
    assert.equal(json.data.statusUrl, `/api/jobs/${json.data.jobId}`);

    // Idempotency replay with same key returns 202 with Idempotency-Replayed header
    const replayReq = new NextRequest(`http://localhost:3000/api/projects/${project.id}/brainstorm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': idempKey,
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({
        expectedDraftRevision: 1,
        prompt: 'Binary Search Algorithm in 60 seconds',
      }),
    });
    const replayRes = await brainstormRoute(replayReq, { params: Promise.resolve({ id: project.id }) });
    assert.equal(replayRes.status, 202);
    assert.equal(replayRes.headers.get('idempotency-replayed'), 'true');
    const replayJson = await replayRes.json();
    assert.equal(replayJson.data.jobId, json.data.jobId);
  });

  test('GET /api/jobs/:id returns brainstorm job with educational suggestions', async () => {
    const project = await createProjectForUser(userA.id);

    const brainstormReq = new NextRequest(`http://localhost:3000/api/projects/${project.id}/brainstorm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomIdempKey(),
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({
        expectedDraftRevision: 1,
        prompt: 'QuickSort Partitioning',
      }),
    });

    const brainstormRes = await brainstormRoute(brainstormReq, { params: Promise.resolve({ id: project.id }) });
    assert.equal(brainstormRes.status, 202);
    const op = (await brainstormRes.json()).data;

    // Fetch job details
    const jobReq = new NextRequest(`http://localhost:3000/api/jobs/${op.jobId}`, {
      method: 'GET',
      headers: { 'x-test-user-id': userA.id },
    });
    const jobRes = await getJobRoute(jobReq, { params: Promise.resolve({ id: op.jobId }) });
    assert.equal(jobRes.status, 200);

    const job = (await jobRes.json()).data as JobView;
    assert.equal(job.id, op.jobId);
    assert.equal(job.projectId, project.id);
    assert.equal(job.type, 'brainstorm');
    assert.equal(job.state, 'succeeded');
    assert.ok(job.result);

    const result = job.result as { kind: string; suggestions: Array<{ id: string; topic: string; angle: string; takeaway: string }> };
    assert.equal(result.kind, 'ideas');
    assert.ok(Array.isArray(result.suggestions));
    assert.ok(result.suggestions.length >= 3);

    for (const s of result.suggestions) {
      assert.ok(s.id);
      assert.ok(s.topic);
      assert.ok(s.angle);
      assert.ok(s.takeaway);
    }
  });

  test('Brainstorm ownership isolation: User B cannot access User A brainstorm job', async () => {
    const project = await createProjectForUser(userA.id);

    const brainstormReq = new NextRequest(`http://localhost:3000/api/projects/${project.id}/brainstorm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomIdempKey(),
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({
        expectedDraftRevision: 1,
        prompt: 'Private Research Concept',
      }),
    });

    const brainstormRes = await brainstormRoute(brainstormReq, { params: Promise.resolve({ id: project.id }) });
    const op = (await brainstormRes.json()).data;

    // User B tries to read User A's job
    const jobReq = new NextRequest(`http://localhost:3000/api/jobs/${op.jobId}`, {
      method: 'GET',
      headers: { 'x-test-user-id': userB.id },
    });
    const jobRes = await getJobRoute(jobReq, { params: Promise.resolve({ id: op.jobId }) });
    assert.equal(jobRes.status, 404);
  });

  test('Applying a brainstorm suggestion persists idea and increments revision', async () => {
    const project = await createProjectForUser(userA.id);

    // Initial draft check
    const draftReq1 = new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
      method: 'GET',
      headers: { 'x-test-user-id': userA.id },
    });
    const draftRes1 = await getDraftRoute(draftReq1, { params: Promise.resolve({ id: project.id }) });
    const draft1 = (await draftRes1.json()).data as DraftView;
    assert.equal(draft1.revision, 1);

    // Apply suggestion via PATCH
    const patchReq = new NextRequest(`http://localhost:3000/api/projects/${project.id}/draft`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({
        expectedRevision: draft1.revision,
        changes: {
          topic: 'Binary Search: The Core Mental Model',
          audience: 'Beginner Computer Science Students',
          notes: '[Angle]: Intuitive visual analogy\n[Key takeaway]: Cuts problem in half every step',
          voicePreset: 'indian-english-male',
        },
      }),
    });

    const patchRes = await patchDraftRoute(patchReq, { params: Promise.resolve({ id: project.id }) });
    assert.equal(patchRes.status, 200);

    const draft2 = (await patchRes.json()).data as DraftView;
    assert.equal(draft2.revision, 2);
    assert.equal(draft2.topic, 'Binary Search: The Core Mental Model');
    assert.equal(draft2.voicePreset, 'indian-english-male');
    assert.equal(draft2.validation.valid, true);
  });

  test('Idea page and project layout render successfully with metadata', async () => {
    assert.equal(ideaMetadata.title, 'Idea & Concept · NamasteVideo.ai');

    const layoutElement = await ProjectLayout({
      children: 'Test content',
      params: Promise.resolve({ id: 'prj_test_123' }),
    });
    assert.ok(layoutElement);
    assert.equal(typeof layoutElement, 'object');

    const pageElement = await IdeaPage({
      params: Promise.resolve({ id: 'prj_test_123' }),
    });
    assert.ok(pageElement);
    assert.equal(typeof pageElement, 'object');
  });
});
