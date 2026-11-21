'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { VoiceSelector, VoiceOption } from './VoiceSelector';
import { BrainstormModal, IdeaSuggestion } from './BrainstormModal';

export interface DraftState {
  projectId: string;
  revision: number;
  topic: string;
  audience: string;
  notes: string;
  voicePreset: string;
  contentHash: string;
  validation: {
    valid: boolean;
    issues: Array<{ path: string; code: string; message: string }>;
  };
  updatedAt: string;
}

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'conflict' | 'error';

export function IdeaEditor({
  projectId,
  initialDraft,
  initialVoices,
}: {
  projectId: string;
  initialDraft: DraftState;
  initialVoices: VoiceOption[];
}) {
  const [topic, setTopic] = useState(initialDraft.topic);
  const [audience, setAudience] = useState(initialDraft.audience);
  const [notes, setNotes] = useState(initialDraft.notes);
  const [voicePreset, setVoicePreset] = useState(initialDraft.voicePreset || 'daniel-test');
  const [revision, setRevision] = useState(initialDraft.revision);
  const [validationIssues, setValidationIssues] = useState(initialDraft.validation.issues);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);
  const [showBrainstorm, setShowBrainstorm] = useState(false);

  // Keep ref to latest values for debounced save
  const stateRef = useRef({ topic, audience, notes, voicePreset, revision });
  stateRef.current = { topic, audience, notes, voicePreset, revision };

  const lastSavedRef = useRef({
    topic: initialDraft.topic,
    audience: initialDraft.audience,
    notes: initialDraft.notes,
    voicePreset: initialDraft.voicePreset || 'daniel-test',
  });

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const performSave = useCallback(async () => {
    const current = stateRef.current;
    const lastSaved = lastSavedRef.current;

    const changes: Record<string, string> = {};
    if (current.topic !== lastSaved.topic) changes.topic = current.topic;
    if (current.audience !== lastSaved.audience) changes.audience = current.audience;
    if (current.notes !== lastSaved.notes) changes.notes = current.notes;
    if (current.voicePreset !== lastSaved.voicePreset) changes.voicePreset = current.voicePreset;

    if (Object.keys(changes).length === 0) {
      setSaveStatus('saved');
      return;
    }

    setSaveStatus('saving');
    setSaveError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: current.revision,
          changes,
        }),
      });

      if (res.status === 409) {
        const errJson = await res.json().catch(() => null);
        const serverRev = errJson?.error?.details?.currentRevision ?? current.revision + 1;
        setConflictRevision(serverRev);
        setSaveStatus('conflict');
        return;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || `Save failed (${res.status})`);
      }

      const json = await res.json();
      const updatedDraft = json.data as DraftState;

      setRevision(updatedDraft.revision);
      setValidationIssues(updatedDraft.validation.issues);
      lastSavedRef.current = {
        topic: updatedDraft.topic,
        audience: updatedDraft.audience,
        notes: updatedDraft.notes,
        voicePreset: updatedDraft.voicePreset,
      };

      setSaveStatus('saved');
      setConflictRevision(null);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'Save error');
    }
  }, [projectId]);

  // Trigger autosave when inputs change
  const scheduleAutosave = useCallback(() => {
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      performSave();
    }, 1000);
  }, [performSave]);

  const handleTopicChange = (val: string) => {
    setTopic(val);
    scheduleAutosave();
  };

  const handleAudienceChange = (val: string) => {
    setAudience(val);
    scheduleAutosave();
  };

  const handleNotesChange = (val: string) => {
    setNotes(val);
    scheduleAutosave();
  };

  const handleVoiceChange = (preset: string) => {
    setVoicePreset(preset);
    scheduleAutosave();
  };

  const handleSelectIdea = (idea: IdeaSuggestion) => {
    setTopic(idea.topic);
    const updatedNotes = notes
      ? `${notes}\n\n[Angle]: ${idea.angle}\n[Key takeaway]: ${idea.takeaway}`
      : `[Angle]: ${idea.angle}\n[Key takeaway]: ${idea.takeaway}`;
    setNotes(updatedNotes);
    scheduleAutosave();
  };

  const handleReloadAfterConflict = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/draft`);
      if (res.ok) {
        const json = await res.json();
        const serverDraft = json.data as DraftState;
        setTopic(serverDraft.topic);
        setAudience(serverDraft.audience);
        setNotes(serverDraft.notes);
        setVoicePreset(serverDraft.voicePreset);
        setRevision(serverDraft.revision);
        setValidationIssues(serverDraft.validation.issues);
        lastSavedRef.current = {
          topic: serverDraft.topic,
          audience: serverDraft.audience,
          notes: serverDraft.notes,
          voicePreset: serverDraft.voicePreset,
        };
        setSaveStatus('saved');
        setConflictRevision(null);
      }
    } catch {
      // Keep input
    }
  };

  const topicIssue = validationIssues.find((i) => i.path === 'topic');
  const isTopicValid = topic.trim().length > 0 && topic.length <= 2000;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Top action and status bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', margin: '0 0 4px' }}>Video Idea & Concept</h2>
          <p className="hint" style={{ margin: 0 }}>Define the core educational message, target audience, and narrator voice.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Autosave status indicator */}
          <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {saveStatus === 'saved' && (
              <span style={{ color: '#4ade80' }}>● Saved</span>
            )}
            {saveStatus === 'saving' && (
              <span style={{ color: 'var(--accent)' }}>◌ Saving…</span>
            )}
            {saveStatus === 'unsaved' && (
              <span style={{ color: 'var(--muted)' }}>○ Unsaved</span>
            )}
            {saveStatus === 'conflict' && (
              <span style={{ color: 'var(--error)' }}>⚠ Conflict</span>
            )}
            {saveStatus === 'error' && (
              <span style={{ color: 'var(--error)' }}>✕ Save failed</span>
            )}
          </span>

          <button
            type="button"
            className="button button--secondary"
            onClick={() => setShowBrainstorm(true)}
            style={{ fontSize: '13px', minHeight: '38px', padding: '8px 16px' }}
          >
            ✦ Brainstorm Ideas
          </button>
        </div>
      </div>

      {/* Conflict notice banner */}
      {saveStatus === 'conflict' && (
        <div className="notice notice--error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>Save Conflict:</strong> This draft was updated in another tab or session (revision {conflictRevision}). Your edits are safely preserved here.
          </div>
          <button
            type="button"
            className="button button--secondary"
            onClick={handleReloadAfterConflict}
            style={{ fontSize: '12px', minHeight: '32px', padding: '4px 12px' }}
          >
            Reload from server
          </button>
        </div>
      )}

      {/* Save error banner */}
      {saveError && (
        <div className="notice notice--error">
          {saveError}
        </div>
      )}

      {/* Main form grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px' }}>
        {/* Left Column: Topic, Audience, Notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Topic Field */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label htmlFor="topic-input" style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
                Topic / Main Concept <span style={{ color: 'var(--accent)' }}>*</span>
              </label>
              <span className="hint" style={{ margin: 0 }}>
                {topic.length}/2,000
              </span>
            </div>
            <textarea
              id="topic-input"
              rows={3}
              value={topic}
              onChange={(e) => handleTopicChange(e.target.value)}
              placeholder="e.g. How binary search eliminates half the search space with each comparison"
              maxLength={2000}
              style={{
                width: '100%',
                background: 'var(--canvas)',
                color: 'var(--text)',
                border: topicIssue ? '1px solid var(--error)' : '1px solid #727272',
                padding: '12px 14px',
                borderRadius: 'var(--radius)',
                fontSize: '15px',
                lineHeight: 1.5,
              }}
            />
            {topicIssue && (
              <span style={{ fontSize: '12px', color: 'var(--error)', marginTop: '4px', display: 'block' }}>
                {topicIssue.message}
              </span>
            )}
          </div>

          {/* Audience Field */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label htmlFor="audience-input" style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
                Target Audience <span className="hint" style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <span className="hint" style={{ margin: 0 }}>
                {audience.length}/200
              </span>
            </div>
            <input
              id="audience-input"
              type="text"
              value={audience}
              onChange={(e) => handleAudienceChange(e.target.value)}
              placeholder="e.g. High school students, beginner programmers, curious general audience"
              maxLength={200}
              style={{
                width: '100%',
                background: 'var(--canvas)',
                color: 'var(--text)',
                border: '1px solid #727272',
                padding: '10px 14px',
                borderRadius: 'var(--radius)',
                fontSize: '14px',
              }}
            />
          </div>

          {/* Notes Field */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label htmlFor="notes-input" style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
                Source Notes & Guidelines <span className="hint" style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <span className="hint" style={{ margin: 0 }}>
                {notes.length}/20,000
              </span>
            </div>
            <textarea
              id="notes-input"
              rows={8}
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Paste relevant textbook excerpts, analogies, bullet points, key equations, or constraints to include in the video narration and visual diagrams."
              maxLength={20000}
              style={{
                width: '100%',
                background: 'var(--canvas)',
                color: 'var(--text)',
                border: '1px solid #727272',
                padding: '12px 14px',
                borderRadius: 'var(--radius)',
                fontSize: '14px',
                lineHeight: 1.5,
              }}
            />
          </div>
        </div>

        {/* Right Column: Voice Selection and Next Action */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <label style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', display: 'block' }}>
              Narrator Voice
            </label>
            <VoiceSelector
              voices={initialVoices}
              selectedPreset={voicePreset}
              onChange={handleVoiceChange}
            />
          </div>

          {/* Navigation Action Card */}
          <div
            className="panel"
            style={{
              marginTop: 'auto',
              padding: '24px',
              borderRadius: 'var(--panel-radius)',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <h4 style={{ margin: 0, fontSize: '15px' }}>Ready to generate storyboard?</h4>
            <p className="hint" style={{ margin: 0 }}>
              Once your topic is set, proceed to step 2 to review the 7-scene animated storyboard and narration.
            </p>
            <div style={{ marginTop: '8px' }}>
              <Link
                href={`/projects/${projectId}/storyboard`}
                className={`button button--primary ${!isTopicValid ? 'disabled' : ''}`}
                style={{
                  width: '100%',
                  pointerEvents: !isTopicValid ? 'none' : 'auto',
                  opacity: !isTopicValid ? 0.5 : 1,
                }}
              >
                Proceed to Storyboard →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Brainstorm Modal Dialog */}
      {showBrainstorm && (
        <BrainstormModal
          projectId={projectId}
          draftRevision={revision}
          initialPrompt={topic}
          onSelectIdea={handleSelectIdea}
          onClose={() => setShowBrainstorm(false)}
        />
      )}
    </div>
  );
}
