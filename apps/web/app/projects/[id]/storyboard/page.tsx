import React from 'react';
import { StoryboardEditor } from '@/components/editor/StoryboardEditor';
import { verifyOwnerAndProject } from '@/app/api/_auth';
import { notFound } from 'next/navigation';

interface StoryboardPageProps {
  params: Promise<{ id: string }>;
}

export default async function StoryboardPage({ params }: StoryboardPageProps) {
  const { id: projectId } = await params;

  // Verify the project exists and the user owns it (same as other pages).
  const { project } = await verifyOwnerAndProject({} as any, projectId); // simple call; verifyOwnerAndProject expects request, but we just need the project check.
  if (!project) {
    notFound();
    return null;
  }

  return <StoryboardEditor projectId={projectId} />;
}
