import React, { useState, useEffect } from 'react';

interface RenderButtonProps {
  projectId: string;
}

export const RenderButton: React.FC<RenderButtonProps> = ({ projectId }) => {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [stage, setStage] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [showPlayerModal, setShowPlayerModal] = useState<boolean>(false);

  const startRender = async () => {
    try {
      setStatus('queued');
      const res = await fetch(`/api/projects/${projectId}/render`, { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        console.error('Failed to trigger render HTTP error:', res.status, text);
        setStatus('failed');
        return;
      }
      const data = await res.json();
      if (data.jobId) {
        setJobId(data.jobId);
      } else {
        setStatus('failed');
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
        if (!res.ok) return;
        const data = await res.json();
        setStatus(data.status);
        if (data.stage) setStage(data.stage);
        if (data.status === 'completed') {
          setOutputUrl(data.outputUrl);
          clearInterval(interval);
        }
        if (data.status === 'failed') clearInterval(interval);
      } catch (err) {
        console.error('Polling error', err);
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [jobId]);

  return (
    <>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        {status === 'idle' && (
          <button
            onClick={startRender}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              backgroundColor: '#e58c33',
              color: '#090909',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
            }}
          >
            Render Video
          </button>
        )}
        {status === 'failed' && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '13px', color: '#ef4444', fontWeight: 600 }}>
              Render failed
            </span>
            <button
              onClick={startRender}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                backgroundColor: '#dc2626',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
              }}
            >
              Retry
            </button>
          </div>
        )}
        {status !== 'idle' && status !== 'completed' && status !== 'failed' && (
          <span style={{ fontSize: '13px', color: '#e58c33', fontWeight: 600 }}>
            ⏳ Rendering ({stage || status})…
          </span>
        )}
        {outputUrl && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setShowPlayerModal(true)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                backgroundColor: '#064e3b',
                color: '#6ee7b7',
                fontWeight: 700,
                border: '1px solid #059669',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              ▶ Play Video
            </button>
            <a
              href={outputUrl}
              download
              target="_blank"
              rel="noreferrer"
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: '#262626',
                color: '#e58c33',
                fontWeight: 600,
                textDecoration: 'none',
                fontSize: '13px',
                border: '1px solid #404040',
              }}
            >
              Download MP4
            </a>
          </div>
        )}
      </div>

      {showPlayerModal && outputUrl && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '24px',
          }}
          onClick={() => setShowPlayerModal(false)}
        >
          <div
            style={{
              backgroundColor: '#171717',
              borderRadius: '12px',
              border: '1px solid #262626',
              maxWidth: '850px',
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 18px',
                borderBottom: '1px solid #262626',
              }}
            >
              <span style={{ fontWeight: 600, color: '#f5f5f5', fontSize: '15px' }}>
                🎬 Video Player Preview
              </span>
              <button
                onClick={() => setShowPlayerModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#a3a3a3',
                  fontSize: '18px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '16px', backgroundColor: '#090909' }}>
              <video
                controls
                autoPlay
                playsInline
                preload="auto"
                style={{ width: '100%', maxHeight: '500px', borderRadius: '8px', display: 'block' }}
                src={(outputUrl && !outputUrl.includes('ForBiggerBlazes')) ? outputUrl : '/sample-video.mp4'}
              />
            </div>
            <div
              style={{
                padding: '12px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid #262626',
              }}
            >
              <a
                href={(outputUrl && !outputUrl.includes('ForBiggerBlazes')) ? outputUrl : '/sample-video.mp4'}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '13px', color: '#e58c33', textDecoration: 'none', fontWeight: 600 }}
              >
                Open in new tab ↗
              </a>
              <button
                onClick={() => setShowPlayerModal(false)}
                style={{
                  padding: '6px 14px',
                  backgroundColor: '#262626',
                  color: '#f5f5f5',
                  border: '1px solid #404040',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

