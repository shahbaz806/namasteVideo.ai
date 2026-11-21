import { getDb } from '../db/client';
import { COLLECTIONS, InternalAccessDocument, PreferencesDocument } from '../db/schema';
import { getAuth } from './index';
import crypto from 'node:crypto';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface AccessCheckResult {
  allowed: boolean;
  record?: InternalAccessDocument;
  reason?: 'NOT_FOUND' | 'DISABLED' | 'PENDING' | 'ACTIVE';
}

export async function checkInternalAccess(email: string): Promise<AccessCheckResult> {
  const normalizedEmail = normalizeEmail(email);
  const db = await getDb();
  const col = db.collection<InternalAccessDocument>(COLLECTIONS.INTERNAL_ACCESS);

  const record = await col.findOne({ normalizedEmail });
  if (!record) {
    return { allowed: false, reason: 'NOT_FOUND' };
  }

  if (!record.enabled || record.provisioningState === 'disabled') {
    return { allowed: false, record, reason: 'DISABLED' };
  }

  if (record.provisioningState === 'pending') {
    return { allowed: false, record, reason: 'PENDING' };
  }

  return { allowed: true, record, reason: 'ACTIVE' };
}

export interface ProvisionUserInput {
  email: string;
  password?: string;
  name?: string;
  operatorRef: string;
}

export interface ProvisionUserResult {
  userId: string;
  email: string;
  name: string;
  created: boolean;
}

export async function provisionUser(input: ProvisionUserInput): Promise<ProvisionUserResult> {
  const normalizedEmail = normalizeEmail(input.email);
  const auth = await getAuth();
  const db = await getDb();

  const internalCol = db.collection<InternalAccessDocument>(COLLECTIONS.INTERNAL_ACCESS);
  const prefCol = db.collection<PreferencesDocument>(COLLECTIONS.PREFERENCES);

  const name = input.name || normalizedEmail.split('@')[0] || 'Creator';
  const password = input.password || 'TemporaryPassword123!';

  let userId: string;
  let isNew = false;

  // Check if user already exists in Better Auth user collection
  const existingUser = await db.collection('user').findOne({ email: normalizedEmail });

  if (existingUser) {
    userId = existingUser._id?.toString() || existingUser.id;
  } else {
    // Create via Better Auth API
    const res = await auth.api.signUpEmail({
      body: {
        email: normalizedEmail,
        password,
        name,
      },
    });

    userId = res.user.id;
    isNew = true;
  }

  const now = new Date();

  // Upsert internalAccess record
  await internalCol.updateOne(
    { normalizedEmail },
    {
      $set: {
        normalizedEmail,
        enabled: true,
        provisionedUserId: userId,
        provisioningState: 'active',
        operatorRef: input.operatorRef,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: `acc_${crypto.randomBytes(12).toString('hex')}`,
        schemaVersion: 1,
        createdAt: now,
      },
    },
    { upsert: true }
  );

  // Upsert initial preferences
  await prefCol.updateOne(
    { ownerId: userId },
    {
      $setOnInsert: {
        _id: `prf_${crypto.randomBytes(12).toString('hex')}`,
        schemaVersion: 1,
        ownerId: userId,
        revision: 1,
        timezone: 'Asia/Kolkata',
        defaultVoicePreset: 'daniel-test',
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true }
  );

  return {
    userId,
    email: normalizedEmail,
    name,
    created: isNew,
  };
}

export async function disableUser(email: string): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  const db = await getDb();

  const internalCol = db.collection<InternalAccessDocument>(COLLECTIONS.INTERNAL_ACCESS);
  const record = await internalCol.findOne({ normalizedEmail });

  if (!record) return false;

  await internalCol.updateOne(
    { normalizedEmail },
    {
      $set: {
        enabled: false,
        provisioningState: 'disabled',
        updatedAt: new Date(),
      },
    }
  );

  // Direct revocation of active sessions in Better Auth collection
  if (record.provisionedUserId) {
    try {
      await db.collection('session').deleteMany({ userId: record.provisionedUserId });
    } catch {
      // Best effort session revocation
    }
  }

  return true;
}
