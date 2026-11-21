import { NextRequest } from 'next/server';
import { requireSession } from '../../../lib/auth/session-guard';
import { createSuccessResponse } from '../../../lib/api';

export interface VoiceOption {
  preset: string;
  label: string;
  accent: string;
  testOnly: boolean;
  sampleAssetId: string | null;
}

export const AUDITIONED_VOICES: VoiceOption[] = [
  {
    preset: 'daniel-test',
    label: 'Daniel',
    accent: 'British English',
    testOnly: true,
    sampleAssetId: null,
  },
  {
    preset: 'indian-english-male',
    label: 'Indian English — Male',
    accent: 'Indian English',
    testOnly: false,
    sampleAssetId: null,
  },
  {
    preset: 'indian-english-female',
    label: 'Indian English — Female',
    accent: 'Indian English',
    testOnly: false,
    sampleAssetId: null,
  },
];

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const { requestId } = auth;

  return createSuccessResponse(
    {
      voices: AUDITIONED_VOICES,
      defaultPreset: 'daniel-test',
    },
    requestId
  );
}
