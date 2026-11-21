import React from 'react';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAuth } from '../../../../lib/auth';
import { getDraft } from '../../../../lib/db/repositories/drafts';
import { AUDITIONED_VOICES } from '../../../api/voices/route';
import { IdeaEditor, DraftState } from '../../../../components/editor';

interface IdeaPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: 'Idea & Concept · NamasteVideo.ai',
  robots: { index: false, follow: false },
};

export default async function IdeaPage({ params }: IdeaPageProps) {
  const { id: projectId } = await params;

  // Resolve authenticated user from session cookie (handled safely outside request context)
  let ownerId = 'anonymous';
  try {
    const cookieStore = await cookies();
    const sessionToken =
      cookieStore.get('better-auth.session_token')?.value ||
      cookieStore.get('__Secure-better-auth.session_token')?.value;

    if (sessionToken) {
      const auth = await getAuth();
      const headers = new Headers();
      headers.set('cookie', cookieStore.toString());
      const sessionData = await auth.api.getSession({ headers });
      if (sessionData?.user?.id) {
        ownerId = sessionData.user.id;
      }
    }
  } catch {
    // Outside active request store (e.g. unit test runner)
  }

  // Fetch draft from repository
  let draft = await getDraft(ownerId, projectId);

  // If not found (e.g. during dev preview or initial navigation), fallback to blank draft
  const initialDraft: DraftState = draft || {
    projectId,
    revision: 1,
    topic: '',
    audience: '',
    notes: '',
    voicePreset: 'daniel-test',
    contentHash: '',
    validation: {
      valid: false,
      issues: [{ path: 'topic', code: 'REQUIRED', message: 'Topic is required to plan a video' }],
    },
    updatedAt: new Date().toISOString(),
  };

  return (
    <div className="panel" style={{ padding: '32px', borderRadius: 'var(--panel-radius)', border: '1px solid var(--border)' }}>
      <IdeaEditor
        projectId={projectId}
        initialDraft={initialDraft}
        initialVoices={AUDITIONED_VOICES}
      />
    </div>
  );
}
