import { DocumentDirectoryPath, exists, mkdir, readDir, unlink } from '@dr.pogodin/react-native-fs';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { assetModelPath, listAssetModels, resolveModelPath } from 'react-native-sherpa-onnx';
import { createTTS, saveAudioToFile, type TtsEngine } from 'react-native-sherpa-onnx/tts';

import { getVoiceProfile, type VoiceProfileId } from '@/features/speech/domain/voiceProfiles';
import { clampTtsSpeed } from '@/features/speech/domain/ttsSpeeds';
import { buildTtsCacheKey } from '@/features/speech/domain/ttsCacheKey';
import { prepareTtsChunks } from '@/features/speech/domain/ttsText';

export const UNIFORM_TTS_MODEL_ID = 'kokoro-int8-en-v0_19';
const BUNDLED_TTS_MODEL_PATH = `models/${UNIFORM_TTS_MODEL_ID}`;
const TTS_AUDIO_DIRECTORY = `${DocumentDirectoryPath}/tts-audio-cache-v2`;
const MAX_PERSISTENT_AUDIO_FILES = 96;
let enginePromise: Promise<TtsEngine> | null = null;
let engineInstance: TtsEngine | null = null;
let synthesisTail: Promise<void> = Promise.resolve();
let audioDirectoryPromise: Promise<void> | null = null;
const synthesisPromises = new Map<string, Promise<string>>();

export interface UniformVoiceProgress {
  percent: number;
  phase: string;
}

export async function isUniformVoiceModelReady(): Promise<boolean> {
  const models = await listAssetModels();
  return models.some((model) => model.folder === UNIFORM_TTS_MODEL_ID);
}

export async function ensureUniformVoiceModel(onProgress?: (progress: UniformVoiceProgress) => void): Promise<string> {
  onProgress?.({ percent: 0, phase: 'Preparing bundled voice pack' });
  const localPath = await resolveModelPath(assetModelPath(BUNDLED_TTS_MODEL_PATH));
  onProgress?.({ percent: 100, phase: 'Ready' });
  return localPath;
}

async function engine(): Promise<TtsEngine> {
  if (engineInstance) return engineInstance;
  if (!enginePromise) {
    enginePromise = (async () => {
      engineInstance = await createTTS({
        modelPath: assetModelPath(BUNDLED_TTS_MODEL_PATH),
        modelType: 'kokoro',
        numThreads: 4,
      });
      return engineInstance;
    })().catch((error) => {
      enginePromise = null;
      engineInstance = null;
      throw error;
    });
  }
  return enginePromise;
}

export async function warmUniformVoiceEngine(): Promise<void> {
  await Promise.all([engine(), trimSpeechCache()]);
}

async function ensureAudioDirectory(): Promise<void> {
  if (!audioDirectoryPromise)
    audioDirectoryPromise = mkdir(TTS_AUDIO_DIRECTORY).catch((error) => {
      audioDirectoryPromise = null;
      throw error;
    });
  await audioDirectoryPromise;
}

async function trimSpeechCache(): Promise<void> {
  await ensureAudioDirectory();
  const files = (await readDir(TTS_AUDIO_DIRECTORY))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.wav'))
    .sort((left, right) => (right.mtime?.getTime() ?? 0) - (left.mtime?.getTime() ?? 0));
  await Promise.all(files.slice(MAX_PERSISTENT_AUDIO_FILES).map((entry) => unlink(entry.path).catch(() => undefined)));
}

async function speechCachePath(text: string, speakerId: number, speed: number): Promise<string> {
  await ensureAudioDirectory();
  // Avoid NUL separators here. Expo's Android native bridge truncates strings at
  // the first NUL, which previously made every verse hash only the model ID and
  // therefore reuse the first synthesized WAV.
  const cacheKey = buildTtsCacheKey(UNIFORM_TTS_MODEL_ID, speakerId, speed, text);
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, cacheKey);
  return `${TTS_AUDIO_DIRECTORY}/quran-folio-translation-${digest}.wav`;
}

async function synthesizeToCache(text: string, profileId: VoiceProfileId, speed: number, path: string): Promise<string> {
  const profile = getVoiceProfile(profileId);
  const tts = await engine();
  const chunks = prepareTtsChunks(text);
  if (!chunks.length) throw new Error('Translation speech text is empty.');
  const generated: { samples: number[]; pauseLength: number }[] = [];
  let sampleRate = 0;
  for (const chunk of chunks) {
    const audio = await tts.generateSpeech(chunk, {
      sid: profile.speakerId,
      speed: clampTtsSpeed(speed),
    });
    if (!sampleRate) sampleRate = audio.sampleRate;
    generated.push({
      samples: audio.samples,
      pauseLength: generated.length ? Math.round(sampleRate * 0.12) : 0,
    });
  }

  // Most verse translations fit one chunk. Reuse its native result directly
  // instead of copying tens of thousands of PCM samples through a growable JS array.
  const samples = generated.length === 1 ? generated[0]!.samples : new Array<number>(generated.reduce((total, audio) => total + audio.pauseLength + audio.samples.length, 0)).fill(0);
  if (generated.length > 1) {
    let offset = 0;
    for (const audio of generated) {
      offset += audio.pauseLength;
      for (let index = 0; index < audio.samples.length; index += 1) {
        samples[offset + index] = audio.samples[index]!;
      }
      offset += audio.samples.length;
    }
  }
  await saveAudioToFile({ samples, sampleRate }, path);
  return path.startsWith('file://') ? path : `file://${path}`;
}

function enqueueSynthesis(task: () => Promise<string>): Promise<string> {
  const result = synthesisTail.then(task, task);
  synthesisTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function synthesizeUniformSpeech(text: string, profileId: VoiceProfileId, speed = 1): Promise<string> {
  const profile = getVoiceProfile(profileId);
  const normalizedSpeed = clampTtsSpeed(speed);
  const path = await speechCachePath(text, profile.speakerId, normalizedSpeed);
  if (await exists(path)) return path.startsWith('file://') ? path : `file://${path}`;

  const pending = synthesisPromises.get(path);
  if (pending) return pending;
  const synthesis = enqueueSynthesis(() => synthesizeToCache(text, profileId, normalizedSpeed, path)).finally(() => synthesisPromises.delete(path));
  synthesisPromises.set(path, synthesis);
  return synthesis;
}

export async function primeUniformSpeech(texts: string[], profileId: VoiceProfileId, speed = 1, signal?: AbortSignal): Promise<void> {
  for (const text of texts) {
    if (signal?.aborted) return;
    const uri = await synthesizeUniformSpeech(text, profileId, speed);
    releaseUniformSpeechUri(uri);
  }
}

export function releaseUniformSpeechUri(_uri: string): void {
  // Cache files are reused/cleared by the operating system; native URIs need no object URL cleanup.
}
