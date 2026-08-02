import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { clampTtsSpeed } from '@/features/speech/domain/ttsSpeeds';
import { normalizeTtsText } from '@/features/speech/domain/ttsText';
import { filterSystemVoices, getSystemSpeechRate, type SystemVoice } from '@/features/speech/domain/systemVoices';

export interface SystemSpeechOptions {
  language: string;
  pitch: number;
  rate: number;
  volume: number;
  voice?: string;
  onDone: () => void;
  onError: (error: Error) => void;
  onStart: () => void;
  onStopped: () => void;
}

export function speakWithSystemVoice(text: string, options: SystemSpeechOptions): void {
  const normalized = normalizeTtsText(text);
  if (!normalized) {
    options.onError(new Error('Translation speech text is empty.'));
    return;
  }

  Speech.speak(normalized, {
    language: options.language,
    onDone: options.onDone,
    onError: options.onError,
    onStart: options.onStart,
    onStopped: options.onStopped,
    pitch: Math.max(0.5, Math.min(2, options.pitch)),
    rate: getSystemSpeechRate(clampTtsSpeed(options.rate)),
    volume: Math.max(0, Math.min(1, options.volume)),
    voice: options.voice,
  });
}

export async function listSystemVoices(language: string): Promise<SystemVoice[]> {
  const voices = await Speech.getAvailableVoicesAsync();
  return filterSystemVoices(
    voices.map((voice) => ({
      identifier: voice.identifier,
      language: voice.language,
      name: voice.name,
      quality: voice.quality,
    })),
    language,
  );
}

export function stopSystemVoice(): Promise<void> {
  return Speech.stop();
}

export function pauseSystemVoice(): Promise<void> {
  return Platform.OS === 'android' ? Speech.stop() : Speech.pause();
}

export function resumeSystemVoice(): Promise<void> {
  return Speech.resume();
}

export function systemVoiceCanResume(): boolean {
  return Platform.OS !== 'android';
}
