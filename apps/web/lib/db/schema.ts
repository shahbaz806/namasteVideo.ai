export const COLLECTIONS = {
  INTERNAL_ACCESS: 'internalAccess',
  PREFERENCES: 'preferences',
  PROJECTS: 'projects',
  DRAFTS: 'drafts',
  CONVERSATIONS: 'conversations',
  MESSAGES: 'messages',
  STORYBOARDS: 'storyboards',
  APPROVALS: 'approvals',
  VIDEOS: 'videos',
  JOBS: 'jobs',
  JOB_STAGES: 'jobStages',
  STAGE_ATTEMPTS: 'stageAttempts',
  RENDER_JOBS: 'renderJobs',
  RENDER_ATTEMPTS: 'renderAttempts',
  ASSETS: 'assets',
  MEDIA_GRANTS: 'mediaGrants',
  VOICE_SAMPLES: 'voiceSamples',
  COMMANDS: 'commands',
  OUTBOX: 'outbox',
  RESOURCE_SLOTS: 'resourceSlots',
  RATE_LIMIT_BUCKETS: 'rateLimitBuckets',
  SERVICE_NONCES: 'serviceNonces',
  SCHEMA_MIGRATIONS: 'schemaMigrations',
  DIAGNOSTIC_EVENTS: 'diagnosticEvents',
  INSTAGRAM_CONNECTIONS: 'instagramConnections',
  OAUTH_STATES: 'oauthStates',
  PUBLISH_INTENTS: 'publishIntents',
  PUBLISH_PAYLOADS: 'publishPayloads',
  PUBLISH_ATTEMPTS: 'publishAttempts',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export interface BaseDocument {
  _id: string;
  schemaVersion: 1;
  createdAt: Date;
  updatedAt: Date;
}

export interface OwnedDocument extends BaseDocument {
  ownerId: string;
}

export interface ProjectOwnedDocument extends OwnedDocument {
  projectId: string;
}

export interface InternalAccessDocument extends BaseDocument {
  normalizedEmail: string;
  enabled: boolean;
  provisionedUserId?: string;
  provisioningState: 'pending' | 'active' | 'disabled';
  operatorRef: string;
}

export interface PreferencesDocument extends OwnedDocument {
  revision: number;
  timezone: string;
  defaultVoicePreset: string;
}

export interface ProjectFlags {
  drafts: boolean;
  ready: boolean;
  scheduled: boolean;
  published: boolean;
  needsAttention: boolean;
}

export interface ProjectDocument extends OwnedDocument {
  title: string;
  revision: number;
  draftRevision: number;
  conversationId: string;
  currentStoryboardId?: string;
  latestReadyVideoId?: string;
  selectedVideoId?: string;
  activeJobId?: string;
  deletedAt: Date | null;
  flags: ProjectFlags;
  contentRevision: number;
}

export interface DraftDocument extends ProjectOwnedDocument {
  revision: number;
  topic: string;
  audience: string;
  notes: string;
  voicePreset: string;
  editablePlan: Record<string, unknown> | null;
  sourceStoryboardId?: string;
  planStale: boolean;
  contentHash: string;
  canonicalizationVersion: 1;
  validationIssues: Array<{ path: string; message: string }>;
}

export interface ConversationDocument extends ProjectOwnedDocument {
  kind: 'project';
  nextSequence: number;
}

export interface MessageDocument extends ProjectOwnedDocument {
  conversationId: string;
  sequence: number;
  operationId?: string;
  role: 'user' | 'assistant';
  text: string;
  sourceStoryboardId?: string;
  sourceVideoId?: string;
  messageKey: string;
}

export interface SchemaMigrationDocument extends BaseDocument {
  migrationName: string;
  checksum: string;
  state: 'running' | 'completed' | 'failed';
  checkpoint?: Record<string, unknown>;
  lease?: {
    holder: string;
    until: Date;
    fence: number;
  };
  errorCode?: string;
}

export interface CommandDocument extends OwnedDocument {
  projectId?: string;
  scope: string;
  idempotencyKey: string;
  requestHash: string;
  state: 'accepted';
  responseStatus: number;
  responseBody: Record<string, unknown>;
  resourceIds: string[];
}

export interface JobDocument extends ProjectOwnedDocument {
  type: string;
  state: string;
  stage: string;
  revision: number;
  attempt: number;
  progress: {
    completedScenes: number | null;
    totalScenes: number | null;
    renderPercent: number | null;
  };
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  inputRequest: Record<string, unknown> | null;
  actions: { cancel: boolean; retry: boolean; regenerate: boolean };
  finishedAt: Date | null;
}

export interface VideoDocument extends ProjectOwnedDocument {
  storyboardId: string;
  state: string;
}

export interface ApprovalDocument extends ProjectOwnedDocument {
  kind: 'story' | 'video';
  subjectId: string;
  subjectHash: string;
  approvedBy: string;
  approvedAt: Date;
  inheritedFromApprovalId?: string;
  reason: 'explicit' | 'visual_inheritance' | 'voice_change_confirmation';
}
