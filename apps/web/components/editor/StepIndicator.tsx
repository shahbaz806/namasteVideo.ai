import React from 'react';
import Link from 'next/link';

export type EditorStep = 'idea' | 'storyboard' | 'video' | 'publish';

interface StepItem {
  key: EditorStep;
  label: string;
  stepNumber: number;
}

const STEPS: StepItem[] = [
  { key: 'idea', label: 'Idea', stepNumber: 1 },
  { key: 'storyboard', label: 'Storyboard', stepNumber: 2 },
  { key: 'video', label: 'Video', stepNumber: 3 },
  { key: 'publish', label: 'Publish', stepNumber: 4 },
];

export function StepIndicator({
  projectId,
  currentStep,
  hasStoryboard = false,
  hasVideo = false,
}: {
  projectId: string;
  currentStep: EditorStep;
  hasStoryboard?: boolean;
  hasVideo?: boolean;
}) {
  const isAccessible = (step: EditorStep): boolean => {
    if (step === 'idea') return true;
    if (step === 'storyboard') return hasStoryboard;
    if (step === 'video') return hasVideo;
    if (step === 'publish') return hasVideo;
    return false;
  };

  return (
    <nav aria-label="Creation stages" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      {STEPS.map((step, index) => {
        const isActive = step.key === currentStep;
        const accessible = isAccessible(step.key);

        const content = (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: 'var(--radius)',
              fontSize: '13px',
              fontWeight: 600,
              background: isActive
                ? 'rgba(229,140,51,0.15)'
                : 'transparent',
              color: isActive
                ? 'var(--accent)'
                : accessible
                ? 'var(--text)'
                : 'var(--muted)',
              border: isActive
                ? '1px solid var(--accent)'
                : '1px solid transparent',
              cursor: accessible ? 'pointer' : 'default',
              transition: 'all .16s ease',
            }}
          >
            <span
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: isActive ? 'var(--accent)' : '#252525',
                color: isActive ? 'var(--canvas)' : 'var(--muted)',
                display: 'grid',
                placeItems: 'center',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              {step.stepNumber}
            </span>
            {step.label}
          </span>
        );

        return (
          <React.Fragment key={step.key}>
            {index > 0 && (
              <span aria-hidden="true" style={{ color: 'var(--border)', fontSize: '12px' }}>
                →
              </span>
            )}
            {accessible && !isActive ? (
              <Link href={`/projects/${projectId}/${step.key}`} style={{ textDecoration: 'none' }}>
                {content}
              </Link>
            ) : (
              content
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
