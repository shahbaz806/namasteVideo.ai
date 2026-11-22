import React from 'react';
import StoryboardEditor from '@/components/editor/StoryboardEditor';

interface StoryboardPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: 'Storyboard Review & Revisions · NamasteVideo.ai',
  robots: { index: false, follow: false },
};

export default async function StoryboardPage({ params }: StoryboardPageProps) {
  const { id: projectId } = await params;
  return <StoryboardEditor projectId={projectId} />;
}
