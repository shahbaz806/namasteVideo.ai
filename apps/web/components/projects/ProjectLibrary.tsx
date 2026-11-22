'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { RenderButton } from '../RenderButton';
import type { ProjectView, ProjectFilter, PageInfo } from './types';
import { fetchProjects, createProject, renameProject, deleteProject } from './api';

// ───────────────── Filter Bar ─────────────────

const FILTERS: { key: ProjectFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'ready', label: 'Ready' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
  { key: 'needs_attention', label: 'Needs Attention' },
];

function FilterBar({ active, onChange }: { active: ProjectFilter; onChange: (f: ProjectFilter) => void }) {
  return (
    <div role="tablist" aria-label="Project filters" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {FILTERS.map((f) => (
        <button
          key={f.key}
          role="tab"
          aria-selected={active === f.key}
          onClick={() => onChange(f.key)}
          style={{
            padding: '6px 14px',
            borderRadius: 'var(--radius)',
            border: active === f.key ? '1px solid var(--accent)' : '1px solid var(--border)',
            background: active === f.key ? 'rgba(229,140,51,0.12)' : 'transparent',
            color: active === f.key ? 'var(--accent)' : 'var(--muted)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            transition: 'border-color .16s ease, background .16s ease',
          }}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ───────────────── Project Card ─────────────────

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function projectStage(p: ProjectView): { label: string; color: string } {
  if (p.flags.needsAttention) return { label: 'Needs Attention', color: 'var(--error)' };
  if (p.flags.published) return { label: 'Published', color: '#4ade80' };
  if (p.flags.scheduled) return { label: 'Scheduled', color: '#60a5fa' };
  if (p.flags.ready) return { label: 'Ready', color: 'var(--accent)' };
  if (p.activeJobId) return { label: 'Processing…', color: '#a78bfa' };
  return { label: 'Draft', color: 'var(--muted)' };
}

function ProjectCard({
  project,
  onRename,
  onDelete,
}: {
  project: ProjectView;
  onRename: (p: ProjectView) => void;
  onDelete: (p: ProjectView) => void;
}) {
  const stage = projectStage(project);
  return (
    <div
      className="panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '20px',
        borderRadius: 'var(--panel-radius)',
        transition: 'border-color .16s ease',
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#555')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = '')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <Link
          href={`/projects/${project.id}/idea`}
          style={{
            fontSize: '15px',
            fontWeight: 600,
            margin: 0,
            lineHeight: 1.3,
            wordBreak: 'break-word',
            flex: 1,
            textDecoration: 'none',
            color: 'var(--text)',
          }}
        >
          {project.title}
        </Link>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '4px',
            border: `1px solid ${stage.color}`,
            color: stage.color,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {stage.label}
        </span>
      </div>

      <span className="hint" style={{ margin: 0 }}>
        Updated {formatRelativeTime(project.updatedAt)}
      </span>

      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
        <Link
          href={`/projects/${project.id}/idea`}
          className="button button--secondary"
          style={{ fontSize: '12px', minHeight: '32px', padding: '4px 12px', flex: 1, textDecoration: 'none' }}
        >
          Open
        </Link>
        {/* Render Video button */}
        <RenderButton projectId={project.id} />
        <button
          className="button button--secondary"
          style={{ fontSize: '12px', minHeight: '32px', padding: '4px 12px' }}
          onClick={() => onRename(project)}
        >
          Rename
        </button>
        <button
          className="button button--secondary"
          style={{
            fontSize: '12px',
            minHeight: '32px',
            padding: '4px 12px',
            borderColor: '#9d655f',
            color: 'var(--error)',
          }}
          onClick={() => onDelete(project)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ───────────────── Rename Dialog ─────────────────

function RenameDialog({
  project,
  onConfirm,
  onCancel,
}: {
  project: ProjectView;
  onConfirm: (newTitle: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(project.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const valid = title.trim().length >= 1 && title.trim().length <= 100;

  return (
    <div
      role="dialog"
      aria-label="Rename project"
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'grid', placeItems: 'center',
        background: 'rgba(0,0,0,0.65)',
      }}
      onClick={onCancel}
    >
      <div
        className="panel"
        style={{
          width: '100%', maxWidth: '420px', padding: '28px',
          borderRadius: 'var(--panel-radius)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: '18px', margin: '0 0 20px' }}>Rename project</h3>
        <label style={{ fontSize: '13px', marginBottom: '6px' }}>
          Title
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            onKeyDown={(e) => { if (e.key === 'Enter' && valid) onConfirm(title.trim()); }}
            style={{
              display: 'block', width: '100%', marginTop: '8px',
              background: 'var(--canvas)', color: 'var(--text)',
              border: '1px solid #727272', padding: '10px 14px',
              borderRadius: 'var(--radius)', fontSize: '14px',
            }}
          />
        </label>
        <span className="hint" style={{ display: 'block', marginBottom: '20px' }}>
          {title.trim().length}/100 characters
        </span>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="button button--secondary" style={{ minHeight: '36px', fontSize: '13px' }} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="button button--primary"
            style={{ minHeight: '36px', fontSize: '13px' }}
            disabled={!valid || title.trim() === project.title}
            onClick={() => onConfirm(title.trim())}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────── Delete Dialog ─────────────────

function DeleteDialog({
  project,
  onConfirm,
  onCancel,
}: {
  project: ProjectView;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Delete project"
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'grid', placeItems: 'center',
        background: 'rgba(0,0,0,0.65)',
      }}
      onClick={onCancel}
    >
      <div
        className="panel"
        style={{
          width: '100%', maxWidth: '420px', padding: '28px',
          borderRadius: 'var(--panel-radius)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: '18px', margin: '0 0 12px' }}>Delete project?</h3>
        <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '24px' }}>
          <strong style={{ color: 'var(--text)' }}>{project.title}</strong> and all associated
          drafts, storyboards, and videos will be permanently removed. This action cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="button button--secondary" style={{ minHeight: '36px', fontSize: '13px' }} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="button button--primary"
            style={{
              minHeight: '36px', fontSize: '13px',
              background: '#dc2626', color: '#fff',
            }}
            onClick={onConfirm}
          >
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────── Skeleton Loader ─────────────────

function SkeletonCards({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="panel"
          style={{
            padding: '20px', borderRadius: 'var(--panel-radius)',
            display: 'flex', flexDirection: 'column', gap: '12px',
          }}
        >
          <div style={{ height: '18px', width: '70%', background: '#252525', borderRadius: '4px' }} />
          <div style={{ height: '14px', width: '40%', background: '#1e1e1e', borderRadius: '4px' }} />
          <div style={{ height: '32px', width: '100%', background: '#1a1a1a', borderRadius: '6px', marginTop: 'auto' }} />
        </div>
      ))}
    </>
  );
}

// ───────────────── Main Library Component ─────────────────

type LoadState = 'idle' | 'loading' | 'error' | 'loaded';

export function ProjectLibrary() {
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({ nextCursor: null, hasMore: false });
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [state, setState] = useState<LoadState>('idle');
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectView | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (f: ProjectFilter, cursor?: string) => {
    try {
      if (!cursor) {
        setState('loading');
        setError(null);
      } else {
        setLoadingMore(true);
      }

      const res = await fetchProjects({ filter: f, cursor, limit: 20 });

      if (cursor) {
        setProjects((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newProjects = res.data.filter((p) => !existingIds.has(p.id));
          return [...prev, ...newProjects];
        });
      } else {
        setProjects(res.data);
      }

      setPageInfo(res.page);
      setState('loaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
      if (!cursor) setState('error');
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  const handleFilterChange = (f: ProjectFilter) => {
    setFilter(f);
    setProjects([]);
    setPageInfo({ nextCursor: null, hasMore: false });
  };

  const handleCreate = async () => {
    setCreating(true);
    setActionError(null);
    try {
      await createProject();
      await load(filter);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (newTitle: string) => {
    if (!renameTarget) return;
    setActionError(null);
    try {
      await renameProject(renameTarget.id, newTitle, renameTarget.revision);
      setRenameTarget(null);
      await load(filter);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to rename project');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionError(null);
    try {
      await deleteProject(deleteTarget.id, deleteTarget.revision);
      setDeleteTarget(null);
      await load(filter);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  return (
    <>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '4px' }}>My Videos</h2>
          <p className="hint" style={{ margin: 0 }}>Your isolated projects and storyboard versions.</p>
        </div>
        <button
          className="button button--primary"
          onClick={handleCreate}
          disabled={creating}
          style={{ minHeight: '40px', fontSize: '14px' }}
        >
          {creating ? 'Creating…' : '+ New video'}
        </button>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: '20px' }}>
        <FilterBar active={filter} onChange={handleFilterChange} />
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="notice notice--error" style={{ marginBottom: '16px' }}>
          {actionError}
          <button
            onClick={() => setActionError(null)}
            style={{
              marginLeft: '12px', background: 'none', border: 'none',
              color: 'var(--error)', cursor: 'pointer', fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Loading state */}
      {state === 'loading' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
          }}
        >
          <SkeletonCards count={6} />
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div
          style={{
            textAlign: 'center', padding: '60px 20px',
            border: '1px dashed var(--border)', borderRadius: 'var(--radius)',
            background: 'var(--canvas)',
          }}
        >
          <p style={{ color: 'var(--error)', fontSize: '15px', marginBottom: '16px' }}>
            {error || 'Something went wrong'}
          </p>
          <button className="button button--secondary" style={{ fontSize: '13px' }} onClick={() => load(filter)}>
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {state === 'loaded' && projects.length === 0 && (
        <div
          style={{
            textAlign: 'center', padding: '60px 20px',
            border: '1px dashed var(--border)', borderRadius: 'var(--radius)',
            background: 'var(--canvas)',
          }}
        >
          <p style={{ color: 'var(--muted)', fontSize: '15px', marginBottom: '16px' }}>
            {filter === 'all'
              ? 'No videos in your workspace yet.'
              : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase() || filter} projects found.`}
          </p>
          {filter === 'all' && (
            <button
              className="button button--primary"
              style={{ fontSize: '13px' }}
              onClick={handleCreate}
              disabled={creating}
            >
              Create your first video
            </button>
          )}
        </div>
      )}

      {/* Project grid */}
      {state === 'loaded' && projects.length > 0 && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onRename={setRenameTarget}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>

          {/* Load more */}
          {pageInfo.hasMore && (
            <div style={{ textAlign: 'center', marginTop: '24px' }}>
              <button
                className="button button--secondary"
                style={{ fontSize: '13px' }}
                disabled={loadingMore}
                onClick={() => pageInfo.nextCursor && load(filter, pageInfo.nextCursor)}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Rename dialog */}
      {renameTarget && (
        <RenameDialog
          project={renameTarget}
          onConfirm={handleRename}
          onCancel={() => setRenameTarget(null)}
        />
      )}

      {/* Delete dialog */}
      {deleteTarget && (
        <DeleteDialog
          project={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
