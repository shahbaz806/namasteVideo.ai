import { Schema, Document, Types } from 'mongoose';

export type RenderJobStage =
  | 'preparing_scenes'
  | 'creating_narration'
  | 'rendering_video'
  | 'checking_output';

export interface RenderJobDocument extends Document {
  projectId: Types.ObjectId;
  status: RenderJobStatus;
  stage?: RenderJobStage;
  createdAt: Date;
  updatedAt: Date;
  outputUrl?: string;
  errorMessage?: string;
}


export const RenderJobSchema = new Schema<RenderJobDocument>(
  {
    projectId: { type: Types.ObjectId, required: true, ref: 'projects' },
    status: { type: String, enum: ['queued','running','completed','failed'], default: 'queued' },
    outputUrl: { type: String },
    errorMessage: { type: String },
    voicePreset: { type: String, enum: ['male','female'], default: 'male' }, // new field
  },
  { timestamps: true } );
    projectId: { type: Types.ObjectId, required: true, ref: 'projects' },
    status: { type: String, enum: ['queued','running','completed','failed'], default: 'queued' },
    outputUrl: { type: String },
    errorMessage: { type: String },
  },
  { timestamps: true }
);
