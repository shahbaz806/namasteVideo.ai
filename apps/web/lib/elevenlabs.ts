import { Buffer } from 'buffer';

/**
 * Generate narration audio via ElevenLabs.
 * Returns a Buffer containing the mp3 data.
 */
export async function generateNarration(text: string, voiceId: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const modelId = process.env.ELEVENLABS_MODEL;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set in environment');
  if (!voiceId) throw new Error('ElevenLabs voiceId is required');

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${err}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
