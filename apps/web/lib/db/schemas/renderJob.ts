import { ObjectId } from 'mongodb';

export type RenderJobStage =
  | 'preparing_scenes'
  | 'creating_narration'
  | 'rendering_video'
  | 'checking_output';

export type RenderJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface RenderJobDocument {
  _id?: ObjectId | string;
  projectId: ObjectId | string;
  status: RenderJobStatus;
  stage?: RenderJobStage;
  voicePreset?: 'male' | 'female';
  createdAt: Date;
  updatedAt: Date;
  outputUrl?: string;
  errorMessage?: string;
}

