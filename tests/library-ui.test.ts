import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { provisionUser } from '../apps/web/lib/auth/admission';
import { getDb, closeMongoClient } from '../apps/web/lib/db/client';
import { GET as listProjectsRoute, POST as createProjectRoute } from '../apps/web/app/api/projects/route';
import {
  PATCH as patchProjectRoute,
  DELETE as deleteProjectRoute,
} from '../apps/web/app/api/projects/[id]/route';
import DashboardPage, { metadata as dashboardMetadata } from '../apps/web/app/dashboard/page';
import type { ProjectView } from '../apps/web/components/projects/types';

// ────────── Test helpers ──────────

let userA: { id: string; email: string };
let userB: { id: string; email: string };

function randomIdempKey() {
  return `idemp_${crypto.randomUUID()}`;
}

async function createTestProject(userId: string, title: string) {
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
  const json = await res.json();
  return { status: res.status, project: json.data as ProjectView };
}

async function listTestProjects(userId: string, query = '') {
  const url = `http://localhost:3000/api/projects${query ? `?${query}` : ''}`;
  const req = new NextRequest(url, {
    method: 'GET',
    headers: {
      'x-test-user-id': userId,
    },
  });
  const res = await listProjectsRoute(req);
  const json = await res.json();
  return { status: res.status, data: json.data as ProjectView[], page: json.page };
}

// ────────── Setup & Teardown ──────────

before(async () => {
  await getDb();
  const timestamp = Date.now();
  const provA = await provisionUser({
    email: `library-a-${timestamp}@example.com`,
    password: 'SecurePasswordA123!',
    name: 'Library User A',
    operatorRef: 'test-f06-a',
  });
  userA = { id: provA.userId, email: provA.email };

  const provB = await provisionUser({
    email: `library-b-${timestamp}@example.com`,
    password: 'SecurePasswordB123!',
    name: 'Library User B',
    operatorRef: 'test-f06-b',
  });
  userB = { id: provB.userId, email: provB.email };
});

after(async () => {
  await closeMongoClient();
});

// ────────── Tests ──────────

describe('F06 — My Videos Library UI', () => {

  it('dashboard page renders with project library markup and correct metadata', () => {
    assert.equal(dashboardMetadata.title, 'Dashboard · NamasteVideo.ai');
    assert.deepEqual(dashboardMetadata.robots, { index: false, follow: false });

    const element = DashboardPage();
    assert.ok(element, 'DashboardPage component should render');
    assert.equal(typeof element, 'object');
  });

  it('filter=all returns projects for authenticated user', async () => {
    const { status, project } = await createTestProject(userA.id, 'F06 Test Project');
    assert.equal(status, 201);
    assert.ok(project.id);

    const listRes = await listTestProjects(userA.id, 'filter=all');
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.data), 'data should be an array');
    assert.ok(listRes.data.length >= 1, 'should have at least one project');

    const found = listRes.data.find((p) => p.title === 'F06 Test Project');
    assert.ok(found, 'should find the created project');
    assert.equal(found.flags.drafts, true, 'new project should have drafts flag');
  });

  it('filter=drafts returns only draft projects', async () => {
    const listRes = await listTestProjects(userA.id, 'filter=drafts');
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.data));
    for (const p of listRes.data) {
      assert.equal(p.flags.drafts, true, `project ${p.id} should have drafts flag`);
    }
  });

  it('filter=published returns empty for new projects', async () => {
    const listRes = await listTestProjects(userA.id, 'filter=published');
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.data));
    assert.equal(listRes.data.length, 0, 'no published projects expected');
  });

  it('rename dialog flow: PATCH updates title successfully', async () => {
    const { status, project } = await createTestProject(userA.id, 'Before Rename');
    assert.equal(status, 201);

    const patchReq = new NextRequest(`http://localhost:3000/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({ title: 'After Rename', expectedRevision: project.revision }),
    });

    const patchRes = await patchProjectRoute(patchReq, { params: Promise.resolve({ id: project.id }) });
    assert.equal(patchRes.status, 200);
    const updated = (await patchRes.json()).data as ProjectView;
    assert.equal(updated.title, 'After Rename');
    assert.equal(updated.revision, project.revision + 1);
  });

  it('delete dialog flow: DELETE soft-deletes and project disappears from list', async () => {
    const { status, project } = await createTestProject(userA.id, 'To Be Deleted');
    assert.equal(status, 201);

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

    const listRes = await listTestProjects(userA.id, 'filter=all');
    assert.equal(listRes.status, 200);
    const found = listRes.data.find((p) => p.id === project.id);
    assert.equal(found, undefined, 'deleted project should not appear in list');
  });

  it('load-more pagination returns next page when cursor is used', async () => {
    const titles = ['Pagination A', 'Pagination B', 'Pagination C'];
    for (const t of titles) {
      await createTestProject(userA.id, t);
    }

    const page1 = await listTestProjects(userA.id, 'limit=2');
    assert.equal(page1.status, 200);
    assert.equal(page1.data.length, 2, 'page 1 should have 2 projects');
    assert.equal(page1.page.hasMore, true, 'should have more pages');
    assert.ok(page1.page.nextCursor, 'should have a cursor');

    const page2 = await listTestProjects(
      userA.id,
      `limit=2&cursor=${encodeURIComponent(page1.page.nextCursor!)}`
    );
    assert.equal(page2.status, 200);
    assert.ok(page2.data.length >= 1, 'page 2 should have at least 1 project');

    const ids1 = new Set(page1.data.map((p) => p.id));
    for (const p of page2.data) {
      assert.ok(!ids1.has(p.id), `project ${p.id} should not appear on both pages`);
    }
  });

  it('empty state: new user with no projects gets empty list', async () => {
    const listRes = await listTestProjects(userB.id);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.length, 0, 'user B should have no projects initially');
    assert.equal(listRes.page.hasMore, false);
    assert.equal(listRes.page.nextCursor, null);
  });
});
