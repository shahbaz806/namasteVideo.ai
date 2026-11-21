import { useState, useEffect } from 'react';
import axios from 'axios';

interface RenderButtonProps {
  projectId: string;
}

export const RenderButton: React.FC<RenderButtonProps> = ({ projectId }) => {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const startRender = async () => {
    const { data } = await axios.post(`/api/projects/${projectId}/render`);
    setJobId(data.jobId);
    setStatus('queued');
  };

  // poll job status
  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      const { data } = await axios.get(`/api/render/${jobId}`);
      setStatus(data.status);
      if (data.status === 'completed') {
        setOutputUrl(data.outputUrl);
        clearInterval(interval);
      }
      if (data.status === 'failed') clearInterval(interval);
    }, 3000);
    return () => clearInterval(interval);
  }, [jobId]);

  return (
    <div>
      {status === 'idle' && <button onClick={startRender}>Render Video</button>}
      {status !== 'idle' && <p>Render status: {status}</p>}
      {outputUrl && <a href={outputUrl} download>Download Video</a>}
    </div>
  );
};
