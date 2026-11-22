'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { RenderButton } from '../RenderButton';
import type { StoryboardFrame, StoryboardDocument } from '../../lib/db/schemas/storyboard';

function FrameCard({
  frame,
  idx,
  isApproved,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  frame: StoryboardFrame;
  idx: number;
  isApproved: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div
      style={{
        backgroundColor: '#151515',
        border: '1px solid #262626',
        borderRadius: '8px',
        padding: '12px',
        width: '260px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: '#e58c33', fontWeight: 600 }}>Scene {idx + 1}</span>
        {!isApproved && (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={onMoveUp}
              style={{
                backgroundColor: '#262626',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 6px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
              title="Move left/up"
            >
              ←
            </button>
            <button
              onClick={onMoveDown}
              style={{
                backgroundColor: '#262626',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 6px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
              title="Move right/down"
            >
              →
            </button>
            <button
              onClick={onRemove}
              style={{
                backgroundColor: '#7f1d1d',
                color: '#fca5a5',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 6px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
              title="Remove scene"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          width: '100%',
          height: '140px',
          borderRadius: '6px',
          overflow: 'hidden',
          backgroundColor: '#090909',
        }}
      >
        <img
          src={frame.imageUrl}
          alt={frame.caption ?? `Scene ${idx + 1}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      <div>
        <label style={{ fontSize: '11px', color: '#a3a3a3', textTransform: 'uppercase' }}>Caption / Title</label>
        <div style={{ fontSize: '13px', color: '#fff', fontWeight: 500 }}>{frame.caption || '(No caption)'}</div>
      </div>

      {frame.narrationText && (
        <div>
          <label style={{ fontSize: '11px', color: '#a3a3a3', textTransform: 'uppercase' }}>Narration</label>
          <div style={{ fontSize: '12px', color: '#d4d4d4', maxHeight: '48px', overflowY: 'auto' }}>
            {frame.narrationText}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StoryboardEditor({ projectId }: { projectId: string }) {
  const [storyboard, setStoryboard] = useState<StoryboardDocument | null>(null);
  const [versions, setVersions] = useState<StoryboardDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [revisionPrompt, setRevisionPrompt] = useState('');
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [approving, setApproving] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sbRes, versRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/storyboard`),
        fetch(`/api/projects/${projectId}/revisions`),
      ]);
      const sbData = await sbRes.json();
      const versData = await versRes.json();

      setStoryboard(sbData.data ?? sbData);
      setVersions(versData.data ?? versData ?? []);
    } catch (err) {
      console.error('Failed to load storyboard data', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async () => {
    if (!storyboard) return;
    setApproving(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/storyboard/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboardId: storyboard._id }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage('Storyboard approved! An immutable approval record has been created.');
        await loadData();
      } else {
        setStatusMessage(`Approval failed: ${data.message || data.error}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error approving: ${err.message}`);
    } finally {
      setApproving(false);
    }
  };

  const handleConversationalRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisionPrompt.trim()) return;

    setSubmittingRevision(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: revisionPrompt.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setRevisionPrompt('');
        setStatusMessage('Revision created successfully as a new version!');
        await loadData();
      } else {
        setStatusMessage(`Revision failed: ${data.message || data.error}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error creating revision: ${err.message}`);
    } finally {
      setSubmittingRevision(false);
    }
  };

  const handleRestore = async (versionId: string) => {
    setRestoringId(versionId);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/revisions/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetVersionId: versionId }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage('Version restored successfully as the new active revision!');
        await loadData();
      } else {
        setStatusMessage(`Restore failed: ${data.message || data.error}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error restoring: ${err.message}`);
    } finally {
      setRestoringId(null);
    }
  };

  const handleAddFrame = async () => {
    const prompt = window.prompt('Enter caption or description for new scene:');
    if (!prompt) return;

    try {
      await fetch(`/api/projects/${projectId}/storyboard/frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: prompt,
          narrationText: prompt,
          imageUrl: `https://placehold.co/600x400/090909/e58c33?text=${encodeURIComponent(prompt)}`,
        }),
      });
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveFrame = async (frameId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/storyboard/frame`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameId }),
      });
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '32px', color: '#a3a3a3' }}>
        Loading storyboard and version history…
      </div>
    );
  }

  const isApproved = storyboard?.state === 'approved';
  const frames = storyboard?.frames ?? [];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      {/* Header & Status */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #262626',
          paddingBottom: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', margin: 0 }}>
            Storyboard & Script Review
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
            <span style={{ fontSize: '13px', color: '#a3a3a3' }}>
              Version {storyboard?.version ?? 1}
              {storyboard?.changeSummary ? ` (${storyboard.changeSummary})` : ''}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: isApproved ? '#064e3b' : '#3b2f15',
                color: isApproved ? '#6ee7b7' : '#fde047',
              }}
            >
              {isApproved ? 'Approved' : 'Review Ready'}
            </span>
            {storyboard?.approvedAt && (
              <span style={{ fontSize: '12px', color: '#6ee7b7' }}>
                Approved on {new Date(storyboard.approvedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {!isApproved ? (
            <button
              onClick={handleApprove}
              disabled={approving || frames.length === 0}
              style={{
                backgroundColor: '#e58c33',
                color: '#090909',
                padding: '8px 18px',
                borderRadius: '6px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {approving ? 'Approving…' : 'Approve Storyboard'}
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ fontSize: '13px', color: '#6ee7b7', alignSelf: 'center', fontWeight: 600 }}>
                ✓ Immutable Approval Locked
              </div>
              <RenderButton projectId={projectId} />
            </div>
          )}
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            backgroundColor: '#1c1917',
            border: '1px solid #44403c',
            borderRadius: '6px',
            padding: '10px 16px',
            marginBottom: '16px',
            color: '#e58c33',
            fontSize: '13px',
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* Conversational Revision Panel */}
      <div
        style={{
          backgroundColor: '#151515',
          border: '1px solid #262626',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
        }}
      >
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>
          Conversational AI Revision
        </h2>
        <p style={{ fontSize: '13px', color: '#a3a3a3', marginBottom: '12px' }}>
          Describe changes or tone adjustments. AI will generate an updated storyboard revision while preserving
          version history.
        </p>
        <form onSubmit={handleConversationalRevision} style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={revisionPrompt}
            onChange={(e) => setRevisionPrompt(e.target.value)}
            placeholder="e.g. 'Make scene 2 more punchy and energetic', 'Shorten narration in scene 1'"
            disabled={submittingRevision}
            style={{
              flex: 1,
              backgroundColor: '#090909',
              border: '1px solid #333',
              borderRadius: '6px',
              padding: '10px 14px',
              color: '#fff',
              fontSize: '14px',
            }}
          />
          <button
            type="submit"
            disabled={submittingRevision || !revisionPrompt.trim()}
            style={{
              backgroundColor: '#262626',
              color: '#fff',
              padding: '10px 18px',
              borderRadius: '6px',
              border: '1px solid #404040',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {submittingRevision ? 'Revising…' : 'Revise Storyboard'}
          </button>
        </form>
      </div>

      {/* Frames Grid */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff' }}>
            Scenes & Timeline ({frames.length})
          </h2>
          {!isApproved && (
            <button
              onClick={handleAddFrame}
              style={{
                backgroundColor: '#262626',
                color: '#fff',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #404040',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              + Add Scene
            </button>
          )}
        </div>

        {frames.length === 0 ? (
          <div
            style={{
              border: '1px dashed #333',
              borderRadius: '8px',
              padding: '40px',
              textAlign: 'center',
              color: '#737373',
            }}
          >
            No storyboard scenes yet. Add a scene or submit a conversational revision prompt above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
            {frames.map((frame, idx) => (
              <FrameCard
                key={String(frame._id || idx)}
                frame={frame}
                idx={idx}
                isApproved={isApproved}
                onRemove={() => handleRemoveFrame(String(frame._id))}
                onMoveUp={() => {}}
                onMoveDown={() => {}}
              />
            ))}
          </div>
        )}
      </div>

      {/* Version History & Restore */}
      <div
        style={{
          backgroundColor: '#121212',
          border: '1px solid #262626',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#fff', marginBottom: '12px' }}>
          Version History ({versions.length})
        </h2>
        {versions.length === 0 ? (
          <p style={{ color: '#737373', fontSize: '13px' }}>No prior versions recorded.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {versions.map((ver) => (
              <div
                key={String(ver._id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  backgroundColor: String(ver._id) === String(storyboard?._id) ? '#1f1b14' : '#171717',
                  border:
                    String(ver._id) === String(storyboard?._id) ? '1px solid #e58c33' : '1px solid #262626',
                  borderRadius: '6px',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, color: '#fff', marginRight: '8px' }}>
                    Version {ver.version}
                  </span>
                  <span style={{ color: '#a3a3a3', fontSize: '13px' }}>
                    {ver.changeSummary || 'Initial'} · {ver.frames?.length ?? 0} scenes
                  </span>
                  {ver.state === 'approved' && (
                    <span
                      style={{
                        marginLeft: '8px',
                        fontSize: '11px',
                        color: '#6ee7b7',
                        border: '1px solid #064e3b',
                        padding: '1px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      Approved
                    </span>
                  )}
                </div>

                {String(ver._id) !== String(storyboard?._id) && (
                  <button
                    onClick={() => handleRestore(String(ver._id))}
                    disabled={restoringId === String(ver._id)}
                    style={{
                      backgroundColor: '#262626',
                      color: '#e58c33',
                      border: '1px solid #404040',
                      borderRadius: '4px',
                      padding: '4px 10px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {restoringId === String(ver._id) ? 'Restoring…' : 'Restore'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
