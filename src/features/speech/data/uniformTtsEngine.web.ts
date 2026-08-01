import { getVoiceProfile, type VoiceProfileId } from '@/features/speech/domain/voiceProfiles';
import { clampTtsSpeed } from '@/features/speech/domain/ttsSpeeds';

export const UNIFORM_TTS_MODEL_ID = 'kitten-nano-en-v0_1-fp16';

export interface UniformVoiceProgress {
  percent: number;
  phase: string;
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  if (response.headers.get('content-type')?.includes('application/json')) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (payload?.error) return new Error(payload.error);
  }
  const message = await response.text().catch(() => '');
  return new Error(message || fallback);
}

export async function isUniformVoiceModelReady(): Promise<boolean> {
  try {
    const response = await fetch('/api/tts/status');
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false;
    return Boolean((await response.json() as { ready?: boolean }).ready);
  } catch {
    return false;
  }
}

export async function ensureUniformVoiceModel(onProgress?: (progress: UniformVoiceProgress) => void): Promise<string> {
  onProgress?.({ percent: 0, phase: 'Downloading voice pack' });
  const response = await fetch('/api/tts/status?ensure=1');
  if (!response.ok) throw await responseError(response, 'The standard voice pack is unavailable in this browser.');
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Standard offline voices are available in the installed Windows app.');
  }
  const result = await response.json() as { ready?: boolean; error?: string };
  if (!result.ready) throw new Error(result.error || 'The standard voice pack is unavailable in this browser.');
  onProgress?.({ percent: 100, phase: 'Ready' });
  return UNIFORM_TTS_MODEL_ID;
}

export async function synthesizeUniformSpeech(text: string, profileId: VoiceProfileId, speed = 1): Promise<string> {
  const profile = getVoiceProfile(profileId);
  const response = await fetch('/api/tts', {
    body: JSON.stringify({ text, speakerId: profile.speakerId, speed: clampTtsSpeed(speed) }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  if (!response.ok) throw await responseError(response, 'Translation speech could not be generated.');
  return URL.createObjectURL(await response.blob());
}

export function releaseUniformSpeechUri(uri: string): void {
  if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
}
