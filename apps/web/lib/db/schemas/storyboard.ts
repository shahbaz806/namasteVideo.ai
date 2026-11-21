import { Schema, model, Document } from 'mongoose';
import { ObjectId } from 'mongodb';

/** Storyboard frame definition */
export interface StoryboardFrame {
  _id: ObjectId;
  /** Image URL (generated or uploaded) */
  imageUrl: string;
  /** Optional caption for the frame */
  caption?: string;
  /** Order index – lower appears first */
  order: number;
}

/** Storyboard document – one per project */
export interface StoryboardDocument extends Document {
  projectId: ObjectId;
  ownerId: string;
  frames: StoryboardFrame[];
  createdAt: Date;
  updatedAt: Date;
}

/** Simple validation for a storyboard frame */
export function validateStoryboardFrame(frame: Omit<StoryboardFrame, '_id'>): void {
  if (!/^https?:\/\/[^\s]+$/.test(frame.imageUrl)) {
    throw new Error('Invalid imageUrl – must be a valid http/https URL');
  }
  if (frame.order < 0) {
    throw new Error('Invalid order – must be non‑negative');
  }
}

const StoryboardMongooseSchema = new Schema<StoryboardDocument>({
  projectId: { type: ObjectId, required: true, index: true },
  ownerId:   { type: String,   required: true, index: true },
  frames: [
    {
      _id:      { type: ObjectId, required: true, auto: true },
      imageUrl: { type: String, required: true,
                  match: [/^https?:\/\/[^\s]+$/, 'Invalid URL'] },
      caption:  { type: String },
      order:    { type: Number, required: true, min: 0 },
    },
  ],
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

export const Storyboard = model<StoryboardDocument>('Storyboard', StoryboardMongooseSchema);

// Keep the plain‑object version for the repository (used with the native Mongo driver)
export const StoryboardSchema = {
  projectId: { type: ObjectId, required: true, index: true },
  ownerId:   { type: String,   required: true, index: true },
  frames: [
    {
      _id:      { type: ObjectId, required: true, auto: true },
      imageUrl: { type: String, required: true },
      caption:  { type: String },
      order:    { type: Number, required: true },
    },
  ],
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
};
