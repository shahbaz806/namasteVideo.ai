/** Client-side project types matching API ProjectView */

export interface ProjectView {
  id: string;
  title: string;
  revision: number;
  draftRevision: number;
  conversationId: string;
  currentStoryboardId: string | null;
  latestReadyVideoId: string | null;
  selectedVideoId: string | null;
  activeJobId: string | null;
  flags: {
    drafts: boolean;
    ready: boolean;
    scheduled: boolean;
    published: boolean;
    needsAttention: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export type ProjectFilter = 'all' | 'drafts' | 'ready' | 'scheduled' | 'published' | 'needs_attention';

export interface PageInfo {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ProjectListResponse {
  data: ProjectView[];
  page: PageInfo;
  requestId: string;
}

export interface ProjectSingleResponse {
  data: ProjectView;
  requestId: string;
}

export interface ApiError {
  error: string;
  message: string;
  requestId?: string;
}
