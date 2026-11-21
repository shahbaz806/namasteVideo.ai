import React from 'react';
import Link from 'next/link';
import { StepIndicator } from '../../../../components/editor';

interface StoryboardLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function StoryboardLayout({ children, params }: StoryboardLayoutProps) {
  const { id: projectId } = await params;

  return (
    <div style={{ padding: '32px 0 60px' }}>
      {/* Top project navigation header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '28px',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link
            href="/dashboard"
            className="button button--secondary"
            style={{ fontSize: '13px', minHeight: '36px', padding: '6px 14px' }}
          >
            ← My Videos
          </Link>
          <span style={{ color: 'var(--muted)', fontSize: '14px' }}>
            Project <code style={{ color: 'var(--text)' }}>{projectId}</code>
          </span>
        </div>

        {/* Set currentStep to "storyboard" */}
        <StepIndicator projectId={projectId} currentStep="storyboard" />
      </div>

      {children}
    </div>
  );
}
