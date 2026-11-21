import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, checkInternalAccess, provisionUser, disableUser } from '../apps/web/lib/auth/admission';
import { getAuth } from '../apps/web/lib/auth/index';
import { getDb, closeMongoClient } from '../apps/web/lib/db/client';
import { COLLECTIONS } from '../apps/web/lib/db/schema';

test('normalizeEmail trims whitespace and lowercases email', () => {
  assert.equal(normalizeEmail('  Test.User+1@Example.COM  '), 'test.user+1@example.com');
  assert.equal(normalizeEmail('FOUNDER@namaste.ai'), 'founder@namaste.ai');
});

test('checkInternalAccess rejects unprovisioned email addresses', async () => {
  const result = await checkInternalAccess('unregistered-user-999@example.com');
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'NOT_FOUND');
});

test('provisionUser creates internalAccess, preferences, and Better Auth account idempotently', async () => {
  const testEmail = `test-creator-${Date.now()}@example.com`;
  const testPassword = 'SecurePassword123!';

  // First provision
  const provisioned = await provisionUser({
    email: testEmail,
    password: testPassword,
    name: 'Test Creator',
    operatorRef: 'unit-test-f03',
  });

  assert.ok(provisioned.userId);
  assert.equal(provisioned.email, testEmail);
  assert.equal(provisioned.created, true);

  // Verify internalAccess record exists in MongoDB
  const db = await getDb();
  const internalRecord = await db.collection(COLLECTIONS.INTERNAL_ACCESS).findOne({
    normalizedEmail: testEmail,
  });
  assert.ok(internalRecord);
  assert.equal(internalRecord.enabled, true);
  assert.equal(internalRecord.provisioningState, 'active');
  assert.equal(internalRecord.provisionedUserId, provisioned.userId);

  // Verify preferences record exists with default timezone & voice preset
  const prefRecord = await db.collection(COLLECTIONS.PREFERENCES).findOne({
    ownerId: provisioned.userId,
  });
  assert.ok(prefRecord);
  assert.equal(prefRecord.timezone, 'Asia/Kolkata');
  assert.equal(prefRecord.defaultVoicePreset, 'daniel-test');

  // Verify checkInternalAccess reports ACTIVE
  const access = await checkInternalAccess(testEmail);
  assert.equal(access.allowed, true);
  assert.equal(access.reason, 'ACTIVE');

  // Verify login via Better Auth API succeeds with correct credentials
  const auth = await getAuth();
  assert.ok(auth);
  const loginSuccess = await auth.api.signInEmail({
    body: {
      email: testEmail,
      password: testPassword,
    },
  });
  assert.ok(loginSuccess.user);
  assert.equal(loginSuccess.user.id, provisioned.userId);
  assert.ok(loginSuccess.token);

  // Verify login fails with wrong password
  await assert.rejects(
    async () => {
      await auth.api.signInEmail({
        body: {
          email: testEmail,
          password: 'WrongPassword123!',
        },
      });
    }
  );

  // Test disable user
  const disabled = await disableUser(testEmail);
  assert.equal(disabled, true);

  // Verify checkInternalAccess reports DISABLED
  const accessAfterDisable = await checkInternalAccess(testEmail);
  assert.equal(accessAfterDisable.allowed, false);
  assert.equal(accessAfterDisable.reason, 'DISABLED');

  // Cleanup test records
  await db.collection(COLLECTIONS.INTERNAL_ACCESS).deleteOne({ normalizedEmail: testEmail });
  await db.collection(COLLECTIONS.PREFERENCES).deleteOne({ ownerId: provisioned.userId });
  await db.collection('user').deleteOne({ email: testEmail });
  await db.collection('account').deleteMany({ userId: provisioned.userId });
  await db.collection('session').deleteMany({ userId: provisioned.userId });
});

after(async () => {
  await closeMongoClient();
});

