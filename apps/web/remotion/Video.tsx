import React from 'react';
import { Composition, Audio } from 'remotion';

const StoryboardComposition: React.FC<{ projectId: string; audioPath?: string }> = ({
  projectId,
  audioPath,
}) => {
  return (
    <div
      style={{
        flex: 1,
        textAlign: 'center',
        fontSize: '2rem',
        backgroundColor: '#090909',
        color: '#e58c33',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
      }}
    >
      <h1>NamasteVideo.ai</h1>
      <p style={{ color: '#fff', fontSize: '1.2rem' }}>Rendering Project: {projectId}</p>
      {audioPath && <Audio src={audioPath} />}
    </div>
  );
};

export const Video: React.FC<{ projectId: string; audioPath?: string }> = ({
  projectId,
  audioPath,
}) => (
  <Composition
    id="Render"
    component={StoryboardComposition}
    durationInFrames={300}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{ projectId, audioPath }}
  />
);
