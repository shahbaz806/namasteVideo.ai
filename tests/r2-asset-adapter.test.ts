import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { provisionUser } from '../apps/web/lib/auth/admission';
import { getDb, closeMongoClient } from '../apps/web/lib/db/client';
import { COLLECTIONS } from '../apps/web/lib/db/schema';
import { POST as createProjectRoute } from '../apps/web/app/api/projects/route';
import { POST as postAssetAccessRoute } from '../apps/web/app/api/assets/[id]/access/route';
import { GET as getMediaRoute, HEAD as headMediaRoute } from '../apps/web/app/api/media/[grantToken]/route';
import {
  generateObjectKey,
  validateObjectKey,
  storageAdapter,
  computeSha256,
} from '../apps/web/lib/storage/r2';
import {
  createAsset,
  markAssetReady,
  getAssetById,
  markAssetDeleted,
} from '../apps/web/lib/db/repositories/assets';
import {
  createMediaGrant,
  verifyMediaGrant,
  revokeMediaGrant,
  revokeProjectMediaGrants,
  hashGrantToken,
} from '../apps/web/lib/storage/mediaGrants';

let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectIdA: string;
let projectIdB: string;

function randomIdempKey() {
  return `idemp_${crypto.randomUUID()}`;
}

before(async () => {
  await getDb();
  const timestamp = Date.now();

  const provA = await provisionUser({
    email: `r2-user-a-${timestamp}@example.com`,
    password: 'SecurePassword123!',
    name: 'R2 User A',
    operatorRef: 'test-runner',
  });
  userA = { id: provA.userId, email: provA.email };

  const provB = await provisionUser({
    email: `r2-user-b-${timestamp}@example.com`,
    password: 'SecurePassword123!',
    name: 'R2 User B',
    operatorRef: 'test-runner',
  });
  userB = { id: provB.userId, email: provB.email };

  // Create Project for User A
  const reqA = new NextRequest('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomIdempKey(),
      'x-test-user-id': userA.id,
    },
    body: JSON.stringify({ title: 'R2 Asset Project A' }),
  });
  const resA = await createProjectRoute(reqA);
  assert.equal(resA.status, 201);
  const jsonA = await resA.json();
  projectIdA = jsonA.data.id;

  // Create Project for User B
  const reqB = new NextRequest('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomIdempKey(),
      'x-test-user-id': userB.id,
    },
    body: JSON.stringify({ title: 'R2 Asset Project B' }),
  });
  const resB = await createProjectRoute(reqB);
  assert.equal(resB.status, 201);
  const jsonB = await resB.json();
  projectIdB = jsonB.data.id;
});

after(async () => {
  try {
    const db = await getDb();
    await db.collection(COLLECTIONS.ASSETS).deleteMany({ projectId: { $in: [projectIdA, projectIdB] } });
    await db.collection(COLLECTIONS.MEDIA_GRANTS).deleteMany({ projectId: { $in: [projectIdA, projectIdB] } });
    await db.collection(COLLECTIONS.PROJECTS).deleteMany({ _id: { $in: [projectIdA, projectIdB] } as any });
  } catch {
    // cleanup
  }
  await closeMongoClient();
});

describe('F12: Private R2 Asset Adapter & Media Access', () => {
  test('1. Object key generation and security validation', () => {
    const validKey = generateObjectKey({
      ownerId: 'user123',
      projectId: 'proj456',
      videoId: 'vid789',
      attemptId: 'att001',
      assetId: 'asset_abc',
      extension: 'mp4',
    });
    assert.equal(
      validKey,
      'owners/user123/projects/proj456/videos/vid789/attempts/att001/asset_abc.mp4'
    );
    assert.equal(validateObjectKey(validKey), true);

    // Rejection of path traversal & malicious inputs
    assert.equal(validateObjectKey('../secrets.txt'), false);
    assert.equal(validateObjectKey('owners/user123/../../etc/passwd'), false);
    assert.equal(validateObjectKey('/owners/user123/projects/p/videos/v/attempts/a/file.mp4'), false);
    assert.equal(validateObjectKey('owners/user123//projects/p/videos/v/attempts/a/file.mp4'), false);
    assert.equal(validateObjectKey('owners\\user123\\projects\\p\\videos\\v\\attempts\\a\\file.mp4'), false);
    assert.equal(validateObjectKey('arbitrary-key.mp4'), false);
  });

  test('2. Storage adapter put, get, head, and idempotent delete', async () => {
    const objectKey = generateObjectKey({
      ownerId: userA.id,
      projectId: projectIdA,
      videoId: 'vid_1',
      attemptId: 'att_1',
      assetId: 'asset_test_1',
      extension: 'mp4',
    });

    const testPayload = Buffer.from('Namaste Video AI Private Binary Stream');
    const expectedSha256 = computeSha256(testPayload);

    // Put Object
    const putRes = await storageAdapter.putObject(objectKey, testPayload, 'video/mp4');
    assert.equal(putRes.bytes, testPayload.length);
    assert.equal(putRes.sha256, expectedSha256);

    // Head Object
    const headRes = await storageAdapter.headObject(objectKey);
    assert.ok(headRes);
    assert.equal(headRes.bytes, testPayload.length);
    assert.equal(headRes.contentType, 'video/mp4');
    assert.equal(headRes.sha256, expectedSha256);

    // Get Object
    const getRes = await storageAdapter.getObject(objectKey);
    assert.ok(getRes);
    assert.deepEqual(getRes.data, testPayload);
    assert.equal(getRes.contentType, 'video/mp4');

    // Delete Object (idempotent)
    const del1 = await storageAdapter.deleteObject(objectKey);
    assert.equal(del1, true);
    const del2 = await storageAdapter.deleteObject(objectKey);
    assert.equal(del2, true);

    const getAfterDelete = await storageAdapter.getObject(objectKey);
    assert.equal(getAfterDelete, null);
  });

  test('3. Asset lifecycle: staging -> ready -> deleted', async () => {
    const objectKey = generateObjectKey({
      ownerId: userA.id,
      projectId: projectIdA,
      videoId: 'vid_2',
      attemptId: 'att_2',
      assetId: 'asset_test_2',
      extension: 'mp4',
    });

    const asset = await createAsset({
      ownerId: userA.id,
      projectId: projectIdA,
      kind: 'video',
      originJobId: 'job_test_1',
      objectKey,
      contentType: 'video/mp4',
      producerFingerprint: 'fp_test_123',
    });

    assert.ok(asset._id);
    assert.equal(asset.state, 'staging');
    assert.equal(asset.readyAt, undefined);

    const verifiedSha = 'a'.repeat(64);
    const readyAsset = await markAssetReady(asset._id, {
      sha256: verifiedSha,
      bytes: 2048,
    });

    assert.ok(readyAsset);
    assert.equal(readyAsset.state, 'ready');
    assert.equal(readyAsset.sha256, verifiedSha);
    assert.equal(readyAsset.bytes, 2048);
    assert.ok(readyAsset.readyAt);

    // Mark deleted
    const deleted = await markAssetDeleted(userA.id, asset._id);
    assert.equal(deleted, true);

    const fetched = await getAssetById(asset._id);
    assert.equal(fetched?.state, 'deleted');
  });

  test('4. Media grant creation, verification, revocation, and expiration', async () => {
    const objectKey = generateObjectKey({
      ownerId: userA.id,
      projectId: projectIdA,
      videoId: 'vid_3',
      attemptId: 'att_3',
      assetId: 'asset_test_3',
      extension: 'mp4',
    });

    const asset = await createAsset({
      ownerId: userA.id,
      projectId: projectIdA,
      kind: 'video',
      originJobId: 'job_test_2',
      objectKey,
      contentType: 'video/mp4',
      producerFingerprint: 'fp_test_grant',
    });

    // Cannot create grant for staging asset
    await assert.rejects(
      async () => {
        await createMediaGrant({
          ownerId: userA.id,
          projectId: projectIdA,
          assetId: asset._id,
          purpose: 'preview',
        });
      },
      { message: 'ASSET_NOT_READY' }
    );

    // Make asset ready
    await markAssetReady(asset._id, {
      sha256: computeSha256(Buffer.from('hello')),
      bytes: 5,
    });

    // Create grant with 10-minute validity
    const grant = await createMediaGrant({
      ownerId: userA.id,
      projectId: projectIdA,
      assetId: asset._id,
      purpose: 'preview',
      lifetimeSeconds: 600,
    });

    assert.ok(grant.token);
    assert.ok(grant.url.startsWith('/api/media/'));
    assert.equal(grant.contentType, 'video/mp4');

    // Verify raw token is NOT stored in DB (only tokenHash)
    const db = await getDb();
    const storedGrant = await db
      .collection(COLLECTIONS.MEDIA_GRANTS)
      .findOne({ _id: grant.grantId as any });
    assert.ok(storedGrant);
    assert.equal((storedGrant as any).token, undefined);
    assert.equal((storedGrant as any).tokenHash, hashGrantToken(grant.token));

    // Verify grant succeeds
    const verified = await verifyMediaGrant(grant.token);
    assert.ok(verified);
    assert.equal(verified.asset._id, asset._id);

    // Expired grant check (simulate past expiry)
    await db
      .collection(COLLECTIONS.MEDIA_GRANTS)
      .updateOne({ _id: grant.grantId as any }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expiredVerified = await verifyMediaGrant(grant.token);
    assert.equal(expiredVerified, null);

    // Revoked grant check
    const grant2 = await createMediaGrant({
      ownerId: userA.id,
      projectId: projectIdA,
      assetId: asset._id,
      purpose: 'download',
    });
    assert.ok(grant2.token);
    const revokeSuccess = await revokeMediaGrant(grant2.grantId, userA.id);
    assert.equal(revokeSuccess, true);

    const revokedVerified = await verifyMediaGrant(grant2.token);
    assert.equal(revokedVerified, null);
  });

  test('5. V06 POST /api/assets/:id/access authorization and grant response', async () => {
    const objectKey = generateObjectKey({
      ownerId: userA.id,
      projectId: projectIdA,
      videoId: 'vid_4',
      attemptId: 'att_4',
      assetId: 'asset_test_4',
      extension: 'mp4',
    });

    const asset = await createAsset({
      ownerId: userA.id,
      projectId: projectIdA,
      kind: 'video',
      originJobId: 'job_test_3',
      objectKey,
      contentType: 'video/mp4',
      producerFingerprint: 'fp_test_api',
    });
    await markAssetReady(asset._id, {
      sha256: computeSha256(Buffer.from('asset data')),
      bytes: 10,
    });

    // 1. Unauthenticated request -> 401
    const unauthReq = new NextRequest(
      `http://localhost:3000/api/assets/${asset._id}/access`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ purpose: 'preview' }),
      }
    );
    const unauthRes = await postAssetAccessRoute(unauthReq, {
      params: Promise.resolve({ id: asset._id }),
    });
    assert.equal(unauthRes.status, 401);

    // 2. Cross-user access (User B requesting User A's asset) -> 404
    const crossReq = new NextRequest(
      `http://localhost:3000/api/assets/${asset._id}/access`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-user-id': userB.id,
        },
        body: JSON.stringify({ purpose: 'preview' }),
      }
    );
    const crossRes = await postAssetAccessRoute(crossReq, {
      params: Promise.resolve({ id: asset._id }),
    });
    assert.equal(crossRes.status, 404);

    // 3. Valid owner request -> 200
    const ownerReq = new NextRequest(
      `http://localhost:3000/api/assets/${asset._id}/access`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-user-id': userA.id,
        },
        body: JSON.stringify({ purpose: 'preview' }),
      }
    );
    const ownerRes = await postAssetAccessRoute(ownerReq, {
      params: Promise.resolve({ id: asset._id }),
    });
    assert.equal(ownerRes.status, 200);
    const ownerJson = await ownerRes.json();
    assert.ok(ownerJson.url.startsWith('/api/media/'));
    assert.ok(ownerJson.expiresAt);
    assert.equal(ownerJson.contentType, 'video/mp4');
    assert.equal(ownerJson.bytes, 10);
  });

  test('6. Gateway GET/HEAD streaming, range headers, and security headers', async () => {
    const payload = Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'); // 36 bytes
    const objectKey = generateObjectKey({
      ownerId: userA.id,
      projectId: projectIdA,
      videoId: 'vid_5',
      attemptId: 'att_5',
      assetId: 'asset_test_5',
      extension: 'mp4',
    });

    await storageAdapter.putObject(objectKey, payload, 'video/mp4');
    const asset = await createAsset({
      ownerId: userA.id,
      projectId: projectIdA,
      kind: 'video',
      originJobId: 'job_test_stream',
      objectKey,
      contentType: 'video/mp4',
      producerFingerprint: 'fp_stream',
    });
    await markAssetReady(asset._id, {
      sha256: computeSha256(payload),
      bytes: payload.length,
    });

    const grant = await createMediaGrant({
      ownerId: userA.id,
      projectId: projectIdA,
      assetId: asset._id,
      purpose: 'preview',
    });

    // 1. Full content streaming (200 OK)
    const getReq = new NextRequest(`http://localhost:3000${grant.url}`);
    const getRes = await getMediaRoute(getReq, {
      params: Promise.resolve({ grantToken: grant.token }),
    });
    assert.equal(getRes.status, 200);
    assert.equal(getRes.headers.get('content-type'), 'video/mp4');
    assert.equal(getRes.headers.get('content-length'), '36');
    assert.equal(getRes.headers.get('accept-ranges'), 'bytes');
    assert.equal(getRes.headers.get('cache-control'), 'private, no-store');
    assert.equal(getRes.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(getRes.headers.get('content-disposition'), 'inline');

    const bodyBuffer = Buffer.from(await getRes.arrayBuffer());
    assert.deepEqual(bodyBuffer, payload);

    // 2. Partial Content (Range: bytes=0-9 -> 10 bytes)
    const rangeReq = new NextRequest(`http://localhost:3000${grant.url}`, {
      headers: { range: 'bytes=0-9' },
    });
    const rangeRes = await getMediaRoute(rangeReq, {
      params: Promise.resolve({ grantToken: grant.token }),
    });
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get('content-range'), 'bytes 0-9/36');
    assert.equal(rangeRes.headers.get('content-length'), '10');
    const rangeBuffer = Buffer.from(await rangeRes.arrayBuffer());
    assert.deepEqual(rangeBuffer, payload.subarray(0, 10));

    // 3. Suffix Range (Range: bytes=-5 -> last 5 bytes)
    const suffixReq = new NextRequest(`http://localhost:3000${grant.url}`, {
      headers: { range: 'bytes=-5' },
    });
    const suffixRes = await getMediaRoute(suffixReq, {
      params: Promise.resolve({ grantToken: grant.token }),
    });
    assert.equal(suffixRes.status, 206);
    assert.equal(suffixRes.headers.get('content-range'), 'bytes 31-35/36');
    assert.equal(suffixRes.headers.get('content-length'), '5');
    const suffixBuffer = Buffer.from(await suffixRes.arrayBuffer());
    assert.deepEqual(suffixBuffer, payload.subarray(31, 36));

    // 4. Unsatisfiable Range (bytes=100-200) -> 416
    const badRangeReq = new NextRequest(`http://localhost:3000${grant.url}`, {
      headers: { range: 'bytes=100-200' },
    });
    const badRangeRes = await getMediaRoute(badRangeReq, {
      params: Promise.resolve({ grantToken: grant.token }),
    });
    assert.equal(badRangeRes.status, 416);
    assert.equal(badRangeRes.headers.get('content-range'), 'bytes */36');

    // 5. Multiple ranges (bytes=0-5, 10-15) -> 416
    const multiRangeReq = new NextRequest(`http://localhost:3000${grant.url}`, {
      headers: { range: 'bytes=0-5, 10-15' },
    });
    const multiRangeRes = await getMediaRoute(multiRangeReq, {
      params: Promise.resolve({ grantToken: grant.token }),
    });
    assert.equal(multiRangeRes.status, 416);

    // 6. HEAD request -> 200 with headers, empty body
    const headReq = new NextRequest(`http://localhost:3000${grant.url}`, {
      method: 'HEAD',
    });
    const headRes = await headMediaRoute(headReq, {
      params: Promise.resolve({ grantToken: grant.token }),
    });
    assert.equal(headRes.status, 200);
    assert.equal(headRes.headers.get('content-length'), '36');
    assert.equal(headRes.headers.get('content-type'), 'video/mp4');

    // 7. Unknown or revoked token -> 404
    const unknownReq = new NextRequest(`http://localhost:3000/api/media/unknown_token_1234567890abcdef`);
    const unknownRes = await getMediaRoute(unknownReq, {
      params: Promise.resolve({ grantToken: 'unknown_token_1234567890abcdef' }),
    });
    assert.equal(unknownRes.status, 404);
  });

  test('7. Project tombstone immediately revokes all media grants', async () => {
    const payload = Buffer.from('Tombstone Media Test');
    const objectKey = generateObjectKey({
      ownerId: userA.id,
      projectId: projectIdA,
      videoId: 'vid_6',
      attemptId: 'att_6',
      assetId: 'asset_test_6',
      extension: 'mp4',
    });

    await storageAdapter.putObject(objectKey, payload, 'video/mp4');
    const asset = await createAsset({
      ownerId: userA.id,
      projectId: projectIdA,
      kind: 'video',
      originJobId: 'job_tombstone',
      objectKey,
      contentType: 'video/mp4',
      producerFingerprint: 'fp_tombstone',
    });
    await markAssetReady(asset._id, {
      sha256: computeSha256(payload),
      bytes: payload.length,
    });

    const grant = await createMediaGrant({
      ownerId: userA.id,
      projectId: projectIdA,
      assetId: asset._id,
      purpose: 'preview',
    });

    // Before tombstone: works
    const resBefore = await verifyMediaGrant(grant.token);
    assert.ok(resBefore);

    // Simulate project deletion transaction: tombstone project and revoke grants
    const db = await getDb();
    await db
      .collection(COLLECTIONS.PROJECTS)
      .updateOne({ _id: projectIdA as any }, { $set: { deletedAt: new Date() } });
    await revokeProjectMediaGrants(projectIdA);

    // After tombstone: verifyMediaGrant returns null and GET returns 404
    const resAfter = await verifyMediaGrant(grant.token);
    assert.equal(resAfter, null);

    const req = new NextRequest(`http://localhost:3000${grant.url}`);
    const mediaRes = await getMediaRoute(req, {
      params: Promise.resolve({ grantToken: grant.token }),
    });
    assert.equal(mediaRes.status, 404);

    // Restore project for clean teardown
    await db
      .collection(COLLECTIONS.PROJECTS)
      .updateOne({ _id: projectIdA as any }, { $set: { deletedAt: null } });
  });
});
