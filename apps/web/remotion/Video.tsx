import { Composition, Audio } from 'remotion';
import { Storyboard } from '@/components/Storyboard'; // assuming existing component

export const Video: React.FC<{projectId:string, audioPath:string}> = ({projectId, audioPath}) => (
  <Composition
    id="Render"
    component={Storyboard}
    durationInFrames={300}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{projectId, audioPath}}
  >
    {audioPath && <Audio src={audioPath} />}
  </Composition>
);

  <Composition
    id="Render"
    component={Storyboard}
    durationInFrames={300} // placeholder, could be dynamic
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{projectId}}
  />
);
