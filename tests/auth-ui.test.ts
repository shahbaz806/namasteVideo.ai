import test from 'node:test';
import assert from 'node:assert/strict';
import { middleware } from '../apps/web/middleware';
import { NextRequest } from 'next/server';
import { provisionUser, disableUser } from '../apps/web/lib/auth/admission';
import { getDb, closeMongoClient } from '../apps/web/lib/db/client';
import { COLLECTIONS } from '../apps/web/lib/db/schema';

test('Middleware: redirects anonymous visitors from private routes to /sign-in', () => {
  // Test /dashboard
  const reqDashboard = new NextRequest('http://localhost:3000/dashboard');
  const resDashboard = middleware(reqDashboard);
  assert.equal(resDashboard.status, 307);
  assert.equal(resDashboard.headers.get('location'), 'http://localhost:3000/sign-in');

  // Test /projects/prj_123 preserves destination in redirect param
  const reqProject = new NextRequest('http://localhost:3000/projects/prj_123');
  const resProject = middleware(reqProject);
  assert.equal(resProject.status, 307);
  assert.equal(
    resProject.headers.get('location'),
    'http://localhost:3000/sign-in?redirect=%2Fprojects%2Fprj_123'
  );
});

test('Middleware: allows public routes without authentication', () => {
  const publicRoutes = ['http://localhost:3000/', 'http://localhost:3000/foundation'];
  for (const url of publicRoutes) {
    const req = new NextRequest(url);
    const res = middleware(req);
    // NextResponse.next() leaves location header null and status 200
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('location'), null);
  }
});

test('Middleware: redirects authenticated creators visiting /sign-in to /dashboard', () => {
  const req = new NextRequest('http://localhost:3000/sign-in', {
    headers: {
      cookie: 'better-auth.session_token=valid-mock-token-xyz',
    },
  });
  const res = middleware(req);
  assert.equal(res.status, 307);
  assert.equal(res.headers.get('location'), 'http://localhost:3000/dashboard');
});

test('Middleware: allows access to private routes when session token is present', () => {
  const req = new NextRequest('http://localhost:3000/dashboard', {
    headers: {
      cookie: 'better-auth.session_token=valid-mock-token-xyz',
    },
  });
  const res = middleware(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('location'), null);
});

test.after(async () => {
  await closeMongoClient();
});
