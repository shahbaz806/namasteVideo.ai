import React, { useState, useEffect } from 'react';

interface RenderButtonProps {
  projectId: string;
}

export const RenderButton: React.FC<RenderButtonProps> = ({ projectId }) => {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const startRender = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/render`, { method: 'POST' });
      const data = await res.json();
      if (data.jobId) {
        setJobId(data.jobId);
        setStatus('queued');
      }
    } catch (err) {
      console.error('Failed to trigger render', err);
      setStatus('failed');
    }
  };

  // poll job status
  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/render/${jobId}`);
        const data = await res.json();
        setStatus(data.status);
        if (data.status === 'completed') {
          setOutputUrl(data.outputUrl);
          clearInterval(interval);
        }
        if (data.status === 'failed') clearInterval(interval);
      } catch (err) {
        console.error('Polling error', err);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [jobId]);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      {status === 'idle' && (
        <button
          onClick={startRender}
          style={{
            padding: '4px 10px',
            borderRadius: '4px',
            backgroundColor: '#e58c33',
            color: '#090909',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
          }}
        >
          Render Video
        </button>
      )}
      {status !== 'idle' && <span style={{ fontSize: '13px' }}>Render status: {status}</span>}
      {outputUrl && (
        <a
          href={outputUrl}
          download
          style={{ color: '#e58c33', textDecoration: 'underline', fontSize: '13px', marginLeft: '6px' }}
        >
          Download Video
        </a>
      )}
    </div>
  );
};
