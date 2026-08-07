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

interface AndroidSpeechState {
  boundaryIndex: number;
  invocation: number;
  normalized: string;
  options: SystemSpeechOptions;
  paused: boolean;
}

let androidSpeech: AndroidSpeechState | null = null;
let androidInvocation = 0;

function speakOnAndroid(state: AndroidSpeechState): void {
  const invocation = ++androidInvocation;
  state.invocation = invocation;
  const offset = state.boundaryIndex;
  Speech.speak(state.normalized.slice(offset), {
    language: state.options.language,
    onBoundary: (event: { charIndex: number }) => {
      if (androidSpeech?.invocation !== invocation) return;
      androidSpeech.boundaryIndex = Math.min(androidSpeech.normalized.length, offset + event.charIndex);
    },
    onDone: () => {
      if (androidSpeech?.invocation !== invocation || androidSpeech.paused) return;
      androidSpeech = null;
      state.options.onDone();
    },
    onError: (error) => {
      if (androidSpeech?.invocation !== invocation || androidSpeech.paused) return;
      androidSpeech = null;
      state.options.onError(error);
    },
    onStart: state.options.onStart,
    onStopped: () => {
      if (androidSpeech?.invocation !== invocation || androidSpeech.paused) return;
      androidSpeech = null;
      state.options.onStopped();
    },
    pitch: Math.max(0.5, Math.min(2, state.options.pitch)),
    rate: getSystemSpeechRate(clampTtsSpeed(state.options.rate)),
    volume: Math.max(0, Math.min(1, state.options.volume)),
    voice: state.options.voice,
  });
}

export function speakWithSystemVoice(text: string, options: SystemSpeechOptions): void {
  const normalized = normalizeTtsText(text);
  if (!normalized) {
    options.onError(new Error('Translation speech text is empty.'));
    return;
  }

  if (Platform.OS === 'android') {
    androidSpeech = { boundaryIndex: 0, invocation: 0, normalized, options, paused: false };
    speakOnAndroid(androidSpeech);
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
  androidSpeech = null;
  androidInvocation += 1;
  return Speech.stop();
}

export function pauseSystemVoice(): Promise<void> {
  if (Platform.OS !== 'android') return Speech.pause();
  if (androidSpeech) androidSpeech.paused = true;
  return Speech.stop();
}

export function resumeSystemVoice(): Promise<void> {
  if (Platform.OS === 'android') {
    if (androidSpeech?.paused) {
      androidSpeech.paused = false;
      speakOnAndroid(androidSpeech);
    }
    return Promise.resolve();
  }
  return Speech.resume();
}

export function systemVoiceCanResume(): boolean {
  return Platform.OS !== 'android' || Boolean(androidSpeech?.paused);
}
