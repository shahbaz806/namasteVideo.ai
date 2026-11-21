import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_INDEXES, COLLECTIONS } from '../apps/web/lib/db/index';
import { getMongoUri } from '../apps/web/lib/db/client';

test('MongoDB client fails fast with clear error when MONGODB_URI is missing', () => {
  const original = process.env.MONGODB_URI;
  try {
    delete process.env.MONGODB_URI;
    assert.throws(
      () => getMongoUri(),
      /MONGODB_URI is not configured/
    );
  } finally {
    process.env.MONGODB_URI = original;
  }
});

test('MongoDB schema index definitions cover all critical collections and partial constraints', () => {
  const collectionNames = REQUIRED_INDEXES.map((d) => d.collection);
  assert.ok(collectionNames.includes(COLLECTIONS.PROJECTS));
  assert.ok(collectionNames.includes(COLLECTIONS.DRAFTS));
  assert.ok(collectionNames.includes(COLLECTIONS.JOBS));
  assert.ok(collectionNames.includes(COLLECTIONS.INTERNAL_ACCESS));

  // Verify active_project_job has partialFilterExpression
  const jobsIndexDef = REQUIRED_INDEXES.find((d) => d.collection === COLLECTIONS.JOBS);
  assert.ok(jobsIndexDef);
  const activeJobIdx = jobsIndexDef.indexes.find((i) => i.name === 'active_project_job');
  assert.ok(activeJobIdx);
  assert.equal(activeJobIdx.unique, true);
  assert.deepEqual(activeJobIdx.partialFilterExpression, { activeSlot: true });
});
