import { getVoiceProfile, type VoiceProfileId } from '@/features/speech/domain/voiceProfiles';
import { clampTtsSpeed } from '@/features/speech/domain/ttsSpeeds';

export const UNIFORM_TTS_MODEL_ID = 'kokoro-int8-en-v0_19';

export interface UniformVoiceProgress {
  percent: number;
  phase: string;
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  if (response.headers.get('content-type')?.includes('application/json')) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (payload?.error) return new Error(payload.error);
  }
  const message = await response.text().catch(() => '');
  return new Error(message || fallback);
}

export async function isUniformVoiceModelReady(): Promise<boolean> {
  try {
    const response = await fetch('/api/tts/status');
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false;
    return Boolean(((await response.json()) as { ready?: boolean }).ready);
  } catch {
    return false;
  }
}

export async function ensureUniformVoiceModel(onProgress?: (progress: UniformVoiceProgress) => void): Promise<string> {
  onProgress?.({ percent: 0, phase: 'Preparing bundled voice pack' });
  const response = await fetch('/api/tts/status?ensure=1');
  if (!response.ok) throw await responseError(response, 'The standard voice pack is unavailable in this browser.');
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Standard offline voices are available in the installed Windows app.');
  }
  const result = (await response.json()) as { ready?: boolean; error?: string };
  if (!result.ready) throw new Error(result.error || 'The standard voice pack is unavailable in this browser.');
  onProgress?.({ percent: 100, phase: 'Ready' });
  return UNIFORM_TTS_MODEL_ID;
}

export async function warmUniformVoiceEngine(): Promise<void> {
  await ensureUniformVoiceModel();
}

export async function synthesizeUniformSpeech(
  text: string,
  profileId: VoiceProfileId,
  speed = 1,
  priority: 'foreground' | 'background' = 'foreground',
  signal?: AbortSignal,
): Promise<string> {
  const profile = getVoiceProfile(profileId);
  const response = await fetch('/api/tts', {
    body: JSON.stringify({
      text,
      speakerId: profile.speakerId,
      speed: clampTtsSpeed(speed),
      priority,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal,
  });
  if (!response.ok) throw await responseError(response, 'Translation speech could not be generated.');
  return URL.createObjectURL(await response.blob());
}

export async function primeUniformSpeech(texts: string[], profileId: VoiceProfileId, speed = 1, signal?: AbortSignal): Promise<void> {
  for (const text of texts) {
    if (signal?.aborted) return;
    const uri = await synthesizeUniformSpeech(text, profileId, speed, 'background', signal);
    releaseUniformSpeechUri(uri);
  }
}

export function releaseUniformSpeechUri(uri: string): void {
  if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
}
