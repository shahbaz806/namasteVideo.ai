import { ObjectId } from 'mongodb';
import { Document } from 'mongoose';


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
  frames: StoryboardFrame[];
  createdAt: Date;
  updatedAt: Date;
}

export const StoryboardSchema = {
  projectId: { type: ObjectId, required: true, index: true },
  frames: [
    {
      _id: { type: ObjectId, required: true, auto: true },
      imageUrl: { type: String, required: true },
      caption: { type: String },
      order: { type: Number, required: true },
    },
  ],
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
};
