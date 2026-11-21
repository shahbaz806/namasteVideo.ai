import { Db, IndexDescription } from 'mongodb';
import { COLLECTIONS } from './schema';

export interface IndexDefinition {
  collection: string;
  indexes: IndexDescription[];
}

export const REQUIRED_INDEXES: IndexDefinition[] = [
  {
    collection: COLLECTIONS.INTERNAL_ACCESS,
    indexes: [
      { name: 'access_email', key: { normalizedEmail: 1 }, unique: true },
      {
        name: 'access_user',
        key: { provisionedUserId: 1 },
        unique: true,
        partialFilterExpression: { provisionedUserId: { $type: 'string' } },
      },
    ],
  },
  {
    collection: COLLECTIONS.PREFERENCES,
    indexes: [{ name: 'preference_owner', key: { ownerId: 1 }, unique: true }],
  },
  {
    collection: COLLECTIONS.PROJECTS,
    indexes: [
      {
        name: 'project_list',
        key: { ownerId: 1, deletedAt: 1, updatedAt: -1, _id: -1 },
      },
      {
        name: 'project_flag_drafts',
        key: { ownerId: 1, deletedAt: 1, 'flags.drafts': 1, updatedAt: -1, _id: -1 },
      },
      {
        name: 'project_flag_ready',
        key: { ownerId: 1, deletedAt: 1, 'flags.ready': 1, updatedAt: -1, _id: -1 },
      },
      {
        name: 'project_flag_scheduled',
        key: { ownerId: 1, deletedAt: 1, 'flags.scheduled': 1, updatedAt: -1, _id: -1 },
      },
      {
        name: 'project_flag_published',
        key: { ownerId: 1, deletedAt: 1, 'flags.published': 1, updatedAt: -1, _id: -1 },
      },
      {
        name: 'project_flag_needsAttention',
        key: { ownerId: 1, deletedAt: 1, 'flags.needsAttention': 1, updatedAt: -1, _id: -1 },
      },
    ],
  },
  {
    collection: COLLECTIONS.DRAFTS,
    indexes: [
      { name: 'draft_owner_project', key: { ownerId: 1, projectId: 1 }, unique: true },
    ],
  },
  {
    collection: COLLECTIONS.CONVERSATIONS,
    indexes: [
      {
        name: 'conversation_project',
        key: { ownerId: 1, projectId: 1, kind: 1 },
        unique: true,
      },
    ],
  },
  {
    collection: COLLECTIONS.MESSAGES,
    indexes: [
      {
        name: 'message_order',
        key: { ownerId: 1, projectId: 1, conversationId: 1, sequence: 1 },
        unique: true,
      },
      {
        name: 'message_once',
        key: { operationId: 1, messageKey: 1 },
        unique: true,
        partialFilterExpression: { operationId: { $type: 'string' } },
      },
    ],
  },
  {
    collection: COLLECTIONS.STORYBOARDS,
    indexes: [
      {
        name: 'storyboard_history',
        key: { ownerId: 1, projectId: 1, createdAt: -1, _id: -1 },
      },
    ],
  },
  {
    collection: COLLECTIONS.APPROVALS,
    indexes: [
      {
        name: 'approval_subject',
        key: { ownerId: 1, kind: 1, subjectId: 1, subjectHash: 1 },
        unique: true,
      },
      {
        name: 'approval_cleanup',
        key: { ownerId: 1, projectId: 1, _id: 1 },
      },
    ],
  },
  {
    collection: COLLECTIONS.VIDEOS,
    indexes: [
      {
        name: 'video_history',
        key: { ownerId: 1, projectId: 1, createdAt: -1, _id: -1 },
      },
    ],
  },
  {
    collection: COLLECTIONS.JOBS,
    indexes: [
      {
        name: 'active_project_job',
        key: { ownerId: 1, projectId: 1 },
        unique: true,
        partialFilterExpression: { activeSlot: true },
      },
      {
        name: 'job_recovery',
        key: { state: 1, deadlineAt: 1, _id: 1 },
      },
      {
        name: 'job_project',
        key: { ownerId: 1, projectId: 1, createdAt: -1 },
      },
    ],
  },
  {
    collection: COLLECTIONS.JOB_STAGES,
    indexes: [
      { name: 'stage_logical', key: { jobId: 1, stageKey: 1 }, unique: true },
      { name: 'stage_cleanup', key: { ownerId: 1, projectId: 1, _id: 1 } },
    ],
  },
  {
    collection: COLLECTIONS.STAGE_ATTEMPTS,
    indexes: [
      { name: 'attempt_sequence', key: { stageId: 1, attemptNumber: 1 }, unique: true },
      { name: 'attempt_cleanup', key: { ownerId: 1, projectId: 1, _id: 1 } },
    ],
  },
  {
    collection: COLLECTIONS.RENDER_ATTEMPTS,
    indexes: [
      { name: 'render_sequence', key: { jobId: 1, attemptNumber: 1 }, unique: true },
      { name: 'render_cleanup', key: { ownerId: 1, projectId: 1, _id: 1 } },
    ],
  },
  {
    collection: COLLECTIONS.ASSETS,
    indexes: [
      { name: 'asset_key', key: { objectKey: 1 }, unique: true },
      {
        name: 'asset_reuse',
        key: { ownerId: 1, projectId: 1, kind: 1, producerFingerprint: 1, state: 1 },
      },
    ],
  },
  {
    collection: COLLECTIONS.VOICE_SAMPLES,
    indexes: [
      { name: 'sample_preset', key: { preset: 1, voiceConfigurationHash: 1 }, unique: true },
    ],
  },
  {
    collection: COLLECTIONS.COMMANDS,
    indexes: [
      { name: 'command_key', key: { ownerId: 1, scope: 1, idempotencyKey: 1 }, unique: true },
      { name: 'command_cleanup', key: { ownerId: 1, projectId: 1 } },
    ],
  },
  {
    collection: COLLECTIONS.OUTBOX,
    indexes: [
      { name: 'outbox_event', key: { eventId: 1 }, unique: true },
      { name: 'outbox_due', key: { state: 1, availableAt: 1, _id: 1 } },
    ],
  },
  {
    collection: COLLECTIONS.RESOURCE_SLOTS,
    indexes: [
      {
        name: 'slot_global',
        key: { resource: 1, slotNumber: 1 },
        unique: true,
        partialFilterExpression: { resource: { $in: ['render_global', 'speech_global'] } },
      },
      {
        name: 'slot_owner',
        key: { resource: 1, ownerId: 1, slotNumber: 1 },
        unique: true,
        partialFilterExpression: { resource: 'owner_stage' },
      },
    ],
  },
  {
    collection: COLLECTIONS.RATE_LIMIT_BUCKETS,
    indexes: [
      {
        name: 'rate_bucket',
        key: { subjectHash: 1, action: 1, windowStart: 1 },
        unique: true,
      },
      {
        name: 'rate_expiry',
        key: { expiresAt: 1 },
        expireAfterSeconds: 0,
      },
    ],
  },
  {
    collection: COLLECTIONS.SERVICE_NONCES,
    indexes: [
      { name: 'nonce_once', key: { serviceId: 1, nonceHash: 1 }, unique: true },
      { name: 'nonce_expiry', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
  },
  {
    collection: COLLECTIONS.SCHEMA_MIGRATIONS,
    indexes: [
      { name: 'migration_name', key: { migrationName: 1 }, unique: true },
    ],
  },
  {
    collection: COLLECTIONS.INSTAGRAM_CONNECTIONS,
    indexes: [
      { name: 'connection_owner', key: { ownerId: 1 }, unique: true },
      {
        name: 'connection_account',
        key: { instagramUserId: 1 },
        unique: true,
        partialFilterExpression: { instagramUserId: { $type: 'string' } },
      },
    ],
  },
  {
    collection: COLLECTIONS.OAUTH_STATES,
    indexes: [
      { name: 'oauth_state', key: { stateHash: 1 }, unique: true },
      { name: 'oauth_expiry', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
  },
  {
    collection: COLLECTIONS.PUBLISH_INTENTS,
    indexes: [
      { name: 'intent_due', key: { state: 1, dueAt: 1, _id: 1 } },
      {
        name: 'intent_unresolved',
        key: { ownerId: 1, videoId: 1, instagramUserId: 1, contentKey: 1 },
        unique: true,
        partialFilterExpression: { unresolved: true },
      },
    ],
  },
  {
    collection: COLLECTIONS.PUBLISH_PAYLOADS,
    indexes: [
      { name: 'payload_revision', key: { intentId: 1, revision: 1 }, unique: true },
      { name: 'payload_cleanup', key: { ownerId: 1, projectId: 1, _id: 1 } },
    ],
  },
  {
    collection: COLLECTIONS.PUBLISH_ATTEMPTS,
    indexes: [
      { name: 'publish_attempt_number', key: { intentId: 1, attemptNumber: 1 }, unique: true },
      { name: 'publish_attempt_cleanup', key: { ownerId: 1, projectId: 1, _id: 1 } },
    ],
  },
  {
    collection: COLLECTIONS.MEDIA_GRANTS,
    indexes: [
      { name: 'grant_token', key: { tokenHash: 1 }, unique: true },
      { name: 'grant_expiry', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
  },
];

export async function initIndexes(db: Db): Promise<{ created: number; existing: number }> {
  let created = 0;
  let existing = 0;

  for (const def of REQUIRED_INDEXES) {
    const col = db.collection(def.collection);
    for (const idx of def.indexes) {
      try {
        const options: Record<string, any> = { name: idx.name };
        if (idx.unique !== undefined) options.unique = idx.unique;
        if (idx.partialFilterExpression !== undefined) {
          options.partialFilterExpression = idx.partialFilterExpression;
        }
        if (idx.expireAfterSeconds !== undefined) {
          options.expireAfterSeconds = idx.expireAfterSeconds;
        }
        await col.createIndex(idx.key, options);
        created++;
      } catch (err: any) {
        // If index already exists with identical spec
        if (err?.code === 85 || err?.codeName === 'IndexOptionsConflict') {
          existing++;
        } else {
          throw err;
        }
      }
    }
  }

  return { created, existing };
}
