import { ObjectId } from 'mongodb';

/** Storyboard frame definition */
export interface StoryboardFrame {
  _id: string | ObjectId;
  /** Image URL (generated or uploaded) */
  imageUrl: string;
  /** Optional caption for the frame */
  caption?: string;
  /** Narration text for the scene/frame */
  narrationText?: string;
  /** Order index – lower appears first */
  order: number;
}

/** Storyboard document */
export interface StoryboardDocument {
  _id?: string | ObjectId;
  projectId: string;
  ownerId: string;
  version: number;
  parentId?: string | null;
  state: 'review_ready' | 'approved';
  changeSummary?: string | null;
  changedSceneIds?: string[];
  contentHash?: string;
  storyHash?: string;
  approvalId?: string | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
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
