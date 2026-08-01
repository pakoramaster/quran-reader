import { CachesDirectoryPath } from '@dr.pogodin/react-native-fs';
import {
  ensureModelByCategory,
  getLocalModelPathByCategory,
  isModelDownloadedByCategory,
  ModelCategory,
  refreshModelsByCategory,
  type DownloadProgress,
} from 'react-native-sherpa-onnx/download';
import { createTTS, saveAudioToFile, type TtsEngine } from 'react-native-sherpa-onnx/tts';

import { getVoiceProfile, type VoiceProfileId } from '@/features/speech/domain/voiceProfiles';
import { clampTtsSpeed } from '@/features/speech/domain/ttsSpeeds';
import { prepareTtsChunks } from '@/features/speech/domain/ttsText';

export const UNIFORM_TTS_MODEL_ID = 'kitten-nano-en-v0_1-fp16';
let enginePromise: Promise<TtsEngine> | null = null;
let outputCounter = 0;

export interface UniformVoiceProgress {
  percent: number;
  phase: string;
}

export async function isUniformVoiceModelReady(): Promise<boolean> {
  return isModelDownloadedByCategory(ModelCategory.Tts, UNIFORM_TTS_MODEL_ID);
}

export async function ensureUniformVoiceModel(onProgress?: (progress: UniformVoiceProgress) => void): Promise<string> {
  await refreshModelsByCategory(ModelCategory.Tts);
  const result = await ensureModelByCategory(ModelCategory.Tts, UNIFORM_TTS_MODEL_ID, {
    onProgress: (progress: DownloadProgress) => onProgress?.({ percent: progress.percent, phase: progress.phase ?? 'downloading' }),
  });
  return result.localPath;
}

async function engine(): Promise<TtsEngine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const localPath = await getLocalModelPathByCategory(ModelCategory.Tts, UNIFORM_TTS_MODEL_ID)
        ?? await ensureUniformVoiceModel();
      return createTTS({ modelPath: { type: 'file', path: localPath }, modelType: 'kitten', numThreads: 2 });
    })().catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

export async function synthesizeUniformSpeech(text: string, profileId: VoiceProfileId, speed = 1): Promise<string> {
  const profile = getVoiceProfile(profileId);
  const tts = await engine();
  const chunks = prepareTtsChunks(text);
  if (!chunks.length) throw new Error('Translation speech text is empty.');
  const samples: number[] = [];
  let sampleRate = 0;
  for (const chunk of chunks) {
    const audio = await tts.generateSpeech(chunk, { sid: profile.speakerId, speed: clampTtsSpeed(speed) });
    if (!sampleRate) sampleRate = audio.sampleRate;
    if (samples.length) {
      const pauseSamples = Math.round(sampleRate * 0.12);
      for (let index = 0; index < pauseSamples; index += 1) samples.push(0);
    }
    for (const sample of audio.samples) samples.push(sample);
  }
  outputCounter += 1;
  const path = `${CachesDirectoryPath}/quran-folio-translation-${outputCounter}.wav`;
  await saveAudioToFile({ samples, sampleRate }, path);
  return path.startsWith('file://') ? path : `file://${path}`;
}

export function releaseUniformSpeechUri(_uri: string): void {
  // Cache files are reused/cleared by the operating system; native URIs need no object URL cleanup.
}
