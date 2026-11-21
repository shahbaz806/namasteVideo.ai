import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetch } from '@/app/lib/fetch'; // assume a fetch wrapper exists
import type { StoryboardFrame } from '../../lib/db/schemas/storyboard';

/** Simple thumbnail component */
function FrameThumb({ frame, onRemove }: { frame: StoryboardFrame; onRemove: () => void }) {
  return (
    <div className="relative w-32 h-24 border rounded overflow-hidden mr-2 mb-2">
      <img src={frame.imageUrl} alt={frame.caption ?? 'Storyboard frame'} className="w-full h-full object-cover" />
      {frame.caption && <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-xs text-white p-1">{frame.caption}</div>}
      <button
        onClick={onRemove}
        className="absolute top-0 right-0 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
        title="Remove frame"
      >✕</button>
    </div>
  );
}

/** Storyboard editor – displays frames, allows reorder (simple up/down), caption edit, and generate */
export default function StoryboardEditor({ projectId }: { projectId: string }) {
  const [frames, setFrames] = useState<StoryboardFrame[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const router = useRouter();

  const loadStoryboard = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/storyboard`);
    const data = await res.json();
    setFrames(data.frames ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadStoryboard();
  }, [loadStoryboard]);

  const handleAdd = async () => {
    const prompt = window.prompt('Enter a caption for the new frame');
    if (!prompt) return;
    const res = await fetch(`/api/projects/${projectId}/storyboard/frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption: prompt, imageUrl: `https://placehold.co/400x300?text=${encodeURIComponent(prompt)}` }),
    });
    await loadStoryboard();
  };

  const handleRemove = async (id: string) => {
    await fetch(`/api/projects/${projectId}/storyboard/frame/${id}`, { method: 'DELETE' });
    await loadStoryboard();
  };

  const handleGenerate = async () => {
    setGenerating(true);
    const res = await fetch(`/api/projects/${projectId}/storyboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Generate storyboard for project', expectedDraftRevision: 0, idempotencyKey: crypto.randomUUID() }),
    });
    const result = await res.json();
    // job started – poll or navigate to jobs page – for brevity just reload
    await loadStoryboard();
    setGenerating(false);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newFrames = [...frames];
    [newFrames[index - 1], newFrames[index]] = [newFrames[index], newFrames[index - 1]];
    setFrames(newFrames);
    // send reorder to backend
    fetch(`/api/projects/${projectId}/storyboard/frame/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: newFrames.map(f => f._id) }),
    });
  };

  const moveDown = (index: number) => {
    if (index === frames.length - 1) return;
    const newFrames = [...frames];
    [newFrames[index + 1], newFrames[index]] = [newFrames[index], newFrames[index + 1]];
    setFrames(newFrames);
    fetch(`/api/projects/${projectId}/storyboard/frame/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: newFrames.map(f => f._id) }),
    });
  };

  if (loading) return <div>Loading storyboard…</div>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Storyboard Editor</h2>
      <div className="flex flex-wrap mb-4">
        {frames.map((frame, idx) => (
          <div key={frame._id as any} className="relative">
            <FrameThumb frame={frame} onRemove={() => handleRemove(frame._id as any)} />
            <div className="flex justify-center space-x-2 mt-1">
              <button onClick={() => moveUp(idx)} className="bg-gray-200 px-2 py-1 text-xs">↑</button>
              <button onClick={() => moveDown(idx)} className="bg-gray-200 px-2 py-1 text-xs">↓</button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={handleAdd} className="btn-primary mr-2">Add Frame</button>
      <button onClick={handleGenerate} disabled={generating} className="btn-primary">
        {generating ? 'Generating…' : 'Generate Storyboard'}
      </button>
    </div>
  );
}
