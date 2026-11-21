'use client';

import React, { useState } from 'react';

export interface IdeaSuggestion {
  id: string;
  topic: string;
  angle: string;
  takeaway: string;
}

export function BrainstormModal({
  projectId,
  draftRevision,
  initialPrompt,
  onSelectIdea,
  onClose,
}: {
  projectId: string;
  draftRevision: number;
  initialPrompt: string;
  onSelectIdea: (suggestion: IdeaSuggestion) => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState(initialPrompt.trim() || 'Binary Search Algorithm');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<IdeaSuggestion[]>([]);

  const handleBrainstorm = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/brainstorm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          expectedDraftRevision: draftRevision,
          prompt: prompt.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || `Brainstorm request failed (${res.status})`);
      }

      const opJson = await res.json();
      const statusUrl = opJson?.data?.statusUrl;

      // Poll for job completion if needed, or fetch directly
      if (statusUrl) {
        const jobRes = await fetch(statusUrl);
        if (jobRes.ok) {
          const jobData = await jobRes.json();
          const ideas = jobData?.data?.result?.suggestions;
          if (Array.isArray(ideas) && ideas.length > 0) {
            setSuggestions(ideas);
            return;
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Brainstorming failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Brainstorm video ideas"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0,0,0,0.7)',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '28px',
          borderRadius: 'var(--panel-radius)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '18px', margin: 0 }}>Brainstorm Video Concepts</h3>
            <p className="hint" style={{ margin: '4px 0 0' }}>
              Explore pedagogical angles tailored for 60–90s explainer videos.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '18px' }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
            What subject or concept do you want to teach?
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. QuickSort, Water Cycle, How DNS Works"
              maxLength={200}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleBrainstorm();
              }}
              style={{
                flex: 1,
                background: 'var(--canvas)',
                color: 'var(--text)',
                border: '1px solid #727272',
                padding: '10px 14px',
                borderRadius: 'var(--radius)',
                fontSize: '14px',
              }}
            />
            <button
              className="button button--primary"
              onClick={handleBrainstorm}
              disabled={loading || !prompt.trim()}
              style={{ fontSize: '13px', whiteSpace: 'nowrap' }}
            >
              {loading ? 'Brainstorming…' : 'Generate Ideas'}
            </button>
          </div>
        </div>

        {error && (
          <div className="notice notice--error" style={{ marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {suggestions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Suggested Angles
            </span>
            {suggestions.map((s) => (
              <div
                key={s.id}
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--canvas)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>{s.topic}</h4>
                  <button
                    className="button button--secondary"
                    onClick={() => {
                      onSelectIdea(s);
                      onClose();
                    }}
                    style={{
                      fontSize: '12px',
                      minHeight: '30px',
                      padding: '4px 12px',
                      borderColor: 'var(--accent)',
                      color: 'var(--accent)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Use this idea
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                  <strong>Angle:</strong> {s.angle}
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)' }}>
                  <strong>Key Takeaway:</strong> {s.takeaway}
                </p>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button className="button button--secondary" onClick={onClose} style={{ fontSize: '13px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
