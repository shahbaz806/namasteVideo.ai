import { Schema, Document, Types } from 'mongoose';

export type RenderJobStage =
  | 'preparing_scenes'
  | 'creating_narration'
  | 'rendering_video'
  | 'checking_output';

export type RenderJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface RenderJobDocument extends Document {
  projectId: Types.ObjectId;
  status: RenderJobStatus;
  stage?: RenderJobStage;
  voicePreset?: 'male' | 'female';
  createdAt: Date;
  updatedAt: Date;
  outputUrl?: string;
  errorMessage?: string;
}

export const RenderJobSchema = new Schema<RenderJobDocument>(
  {
    projectId: { type: Schema.Types.ObjectId, required: true, ref: 'projects' },
    status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'queued' },
    outputUrl: { type: String },
    errorMessage: { type: String },
    voicePreset: { type: String, enum: ['male', 'female'], default: 'male' },
  },
  { timestamps: true }
);
