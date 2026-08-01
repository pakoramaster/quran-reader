import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { type PlaybackMode, type ReciterId } from '@/features/recitation/domain/reciters';
import { releaseDownloadedRecitationUri } from '@/features/recitation/data/recitationFileStore';
import { resolveRecitationPlaybackSource } from '@/features/recitation/data/recitationPlaybackSource';
import { releaseUniformSpeechUri, synthesizeUniformSpeech, warmUniformVoiceEngine } from '@/features/speech/data/uniformTtsEngine';
import { getTtsSpeed } from '@/features/speech/domain/ttsSpeeds';
import { DEFAULT_VOICE_PROFILE_ID, type VoiceProfileId } from '@/features/speech/domain/voiceProfiles';
import { beginPlaybackSource, createPlaybackCompletionTracker, observePlaybackStatus } from '@/features/speech/domain/playbackCompletion';
import type { TranslationVerse, VerseKey } from '@/types/domain';

type SpeechStatus = 'idle' | 'speaking' | 'paused' | 'loading' | 'error';
type PlaybackPhase = 'recitation' | 'translation';

interface SpeechState {
  status: SpeechStatus;
  currentVerseKey: VerseKey | null;
  phase: PlaybackPhase | null;
  error: string | null;
  rangeIteration: number;
  rangeRepeat: number;
}

interface PlaybackVerse extends TranslationVerse {
  text: string;
}

interface SpeechContextValue extends SpeechState {
  speakAyah: (verse: TranslationVerse, language: string, voice?: VoiceProfileId, rate?: number, pitch?: number, volume?: number) => void;
  speakSurah: (verses: TranslationVerse[], language: string, voice?: VoiceProfileId, rate?: number, pitch?: number, volume?: number) => void;
  play: (
    verses: PlaybackVerse[],
    mode: PlaybackMode,
    reciterId: ReciterId,
    language?: string,
    voice?: VoiceProfileId,
    rate?: number,
    pitch?: number,
    volume?: number,
    repeats?: PlaybackRepeats,
  ) => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  setVolume: (volume: number) => void;
  stop: () => Promise<void>;
  reset: () => Promise<void>;
}

export interface PlaybackRepeats {
  range: number;
  ayah: number;
  startAt?: number;
}

interface QueueConfig {
  verses: PlaybackVerse[];
  mode: PlaybackMode;
  reciterId: ReciterId;
  language: string;
  voice: VoiceProfileId;
  rate: number;
  pitch: number;
  volume: number;
  repeats: PlaybackRepeats;
}

interface TranslationSynthesisResult {
  uri: string | null;
  error: unknown | null;
}

interface TranslationCacheEntry {
  index: number;
  session: number;
  result: Promise<TranslationSynthesisResult>;
}

const TRANSLATION_PREFETCH_AHEAD = 2;
const initialState: SpeechState = {
  status: 'idle',
  currentVerseKey: null,
  phase: null,
  error: null,
  rangeIteration: 1,
  rangeRepeat: 1,
};
const SpeechContext = createContext<SpeechContextValue | null>(null);

function setPlayerVolume(player: { volume: number }, volume: number) {
  player.volume = volume;
}

function synthesizeTranslation(queue: QueueConfig, verse: PlaybackVerse): Promise<TranslationSynthesisResult> {
  return synthesizeUniformSpeech(verse.text, queue.voice, queue.rate)
    .then((uri) => ({ uri, error: null }))
    .catch((error: unknown) => ({ uri: null, error }));
}

export function SpeechProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SpeechState>(initialState);
  const player = useAudioPlayer(null, {
    crossOrigin: 'anonymous',
    updateInterval: 250,
    keepAudioSessionActive: true,
  });
  const playerStatus = useAudioPlayerStatus(player);
  const queueRef = useRef<QueueConfig | null>(null);
  const indexRef = useRef(0);
  const phaseRef = useRef<PlaybackPhase | null>(null);
  const ayahRunRef = useRef(1);
  const rangeRunRef = useRef(1);
  const sessionRef = useRef(0);
  const readySessionRef = useRef(0);
  const pausedRef = useRef(false);
  const advanceRef = useRef<(session: number) => void>(() => undefined);
  const localAudioUriRef = useRef<string | null>(null);
  const translationCacheRef = useRef<Map<number, TranslationCacheEntry>>(new Map());
  const playbackCompletionRef = useRef(createPlaybackCompletionTracker());

  const clearTranslationCache = useCallback(() => {
    const cached = [...translationCacheRef.current.values()];
    translationCacheRef.current.clear();
    for (const entry of cached) {
      void entry.result.then(({ uri }) => {
        if (uri) releaseUniformSpeechUri(uri);
      });
    }
  }, []);

  const prepareTranslation = useCallback((index: number, session: number, queue: QueueConfig) => {
    const verse = queue.verses[index];
    if (!verse) return null;
    const current = translationCacheRef.current.get(index);
    if (current?.session === session) return current.result;
    const entry: TranslationCacheEntry = {
      index,
      session,
      result: synthesizeTranslation(queue, verse),
    };
    translationCacheRef.current.set(index, entry);
    return entry.result;
  }, []);

  const prefetchTranslations = useCallback(
    (startIndex: number, session: number, queue: QueueConfig, count = TRANSLATION_PREFETCH_AHEAD) => {
      const end = Math.min(queue.verses.length, startIndex + count);
      void (async () => {
        for (let index = startIndex; index < end; index += 1) {
          if (session !== sessionRef.current) return;
          const synthesis = prepareTranslation(index, session, queue);
          if (synthesis) await synthesis;
        }
      })();
    },
    [prepareTranslation],
  );

  const pruneTranslationCache = useCallback((currentIndex: number) => {
    for (const [index, entry] of translationCacheRef.current) {
      if (index >= currentIndex && index <= currentIndex + TRANSLATION_PREFETCH_AHEAD) continue;
      translationCacheRef.current.delete(index);
      void entry.result.then(({ uri }) => {
        if (uri) releaseUniformSpeechUri(uri);
      });
    }
  }, []);

  const beginTranslation = useCallback(
    (index: number, session: number) => {
      const queue = queueRef.current;
      const verse = queue?.verses[index];
      if (!queue || !verse || session !== sessionRef.current) return;
      phaseRef.current = 'translation';
      readySessionRef.current = 0;
      setState({
        status: 'loading',
        currentVerseKey: verse.key,
        phase: 'translation',
        error: null,
        rangeIteration: rangeRunRef.current,
        rangeRepeat: queue.repeats.range,
      });
      const synthesis = prepareTranslation(index, session, queue);
      if (!synthesis) return;
      void synthesis
        .then(({ uri, error }) => {
          if (!uri) throw error instanceof Error ? error : new Error('Translation speech failed.');
          if (session !== sessionRef.current) {
            releaseUniformSpeechUri(uri);
            return;
          }
          if (__DEV__) console.info('[Quran Folio TTS]', { text: verse.text.slice(0, 48), uri, verseKey: verse.key });
          beginPlaybackSource(playbackCompletionRef.current);
          player.replace({ uri, name: `Translation ${verse.key}` });
          setPlayerVolume(player, queue.volume);
          pruneTranslationCache(index);
          prefetchTranslations(index + 1, session, queue);
          readySessionRef.current = session;
          if (pausedRef.current) setState((current) => ({ ...current, status: 'paused' }));
          else player.play();
        })
        .catch((error) => {
          if (session === sessionRef.current)
            setState({
              status: 'error',
              currentVerseKey: verse.key,
              phase: 'translation',
              error: error instanceof Error ? error.message : 'Translation speech failed.',
              rangeIteration: rangeRunRef.current,
              rangeRepeat: queue.repeats.range,
            });
        });
    },
    [player, prefetchTranslations, prepareTranslation, pruneTranslationCache],
  );

  const beginRecitation = useCallback(
    (index: number, session: number) => {
      const queue = queueRef.current;
      const verse = queue?.verses[index];
      if (!queue || !verse || session !== sessionRef.current) return;
      phaseRef.current = 'recitation';
      readySessionRef.current = 0;
      setState({
        status: 'loading',
        currentVerseKey: verse.key,
        phase: 'recitation',
        error: null,
        rangeIteration: rangeRunRef.current,
        rangeRepeat: queue.repeats.range,
      });
      void resolveRecitationPlaybackSource(queue.reciterId, verse.key).then(({ uri, localUri }) => {
        if (session !== sessionRef.current) {
          if (localUri) releaseDownloadedRecitationUri(localUri);
          return;
        }
        if (localAudioUriRef.current) releaseDownloadedRecitationUri(localAudioUriRef.current);
        localAudioUriRef.current = localUri;
        beginPlaybackSource(playbackCompletionRef.current);
        player.replace({ uri, name: verse.key });
        setPlayerVolume(player, queue.volume);
        readySessionRef.current = session;
        if (pausedRef.current) setState((current) => ({ ...current, status: 'paused' }));
        else player.play();
        if (queue.mode === 'both') prefetchTranslations(index, session, queue, TRANSLATION_PREFETCH_AHEAD + 1);
      });
    },
    [player, prefetchTranslations],
  );

  const beginAt = useCallback(
    (index: number, session: number) => {
      const queue = queueRef.current;
      const verse = queue?.verses[index];
      if (!queue || !verse || session !== sessionRef.current) {
        phaseRef.current = null;
        setState((current) => ({
          ...current,
          status: 'idle',
          phase: null,
          error: null,
        }));
        return;
      }
      indexRef.current = index;
      if (queue.mode === 'translation') beginTranslation(index, session);
      else beginRecitation(index, session);
    },
    [beginRecitation, beginTranslation],
  );

  const advance = useCallback(
    (session: number) => {
      const queue = queueRef.current;
      if (!queue || session !== sessionRef.current) return;
      if (queue.mode === 'both' && phaseRef.current === 'recitation') {
        beginTranslation(indexRef.current, session);
      } else if (ayahRunRef.current < queue.repeats.ayah) {
        ayahRunRef.current += 1;
        beginAt(indexRef.current, session);
      } else if (indexRef.current + 1 < queue.verses.length) {
        ayahRunRef.current = 1;
        beginAt(indexRef.current + 1, session);
      } else if (rangeRunRef.current < queue.repeats.range) {
        rangeRunRef.current += 1;
        ayahRunRef.current = 1;
        beginAt(0, session);
      } else {
        beginAt(queue.verses.length, session);
      }
    },
    [beginAt, beginTranslation],
  );

  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);
  useEffect(() => {
    if (!phaseRef.current) return;
    const playbackEvent = playerStatus.error
      ? null
      : observePlaybackStatus(playbackCompletionRef.current, {
          currentTime: playerStatus.currentTime,
          didJustFinish: playerStatus.didJustFinish,
          isBuffering: playerStatus.isBuffering,
          isLoaded: playerStatus.isLoaded,
          playbackState: playerStatus.playbackState,
          playing: playerStatus.playing,
        });
    if (playerStatus.error) {
      if (phaseRef.current === 'recitation') clearTranslationCache();
      // Audio status is an external native event reflected into React state.
      setState((current) => ({
        ...current,
        status: 'error',
        error: phaseRef.current === 'recitation' ? 'Recitation could not be played. Check the download or your connection and try again.' : 'Translation speech could not be played.',
      }));
    } else if (playbackEvent === 'completed') {
      advanceRef.current(sessionRef.current);
    } else if (playbackEvent === 'playing') {
      // Audio status is an external native event reflected into React state.
      setState((current) => ({ ...current, status: 'speaking', error: null }));
    }
  }, [
    clearTranslationCache,
    playerStatus.currentTime,
    playerStatus.didJustFinish,
    playerStatus.error,
    playerStatus.isBuffering,
    playerStatus.isLoaded,
    playerStatus.playbackState,
    playerStatus.playing,
  ]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      shouldPlayInBackground: true,
    });
    void warmUniformVoiceEngine().catch(() => undefined);
  }, []);

  const play = useCallback(
    (
      verses: PlaybackVerse[],
      mode: PlaybackMode,
      reciterId: ReciterId,
      language = 'en',
      voice: VoiceProfileId = DEFAULT_VOICE_PROFILE_ID,
      rate = getTtsSpeed(null).value,
      pitch = 1,
      volume = 1,
      repeats: PlaybackRepeats = { range: 1, ayah: 1 },
    ) => {
      clearTranslationCache();
      sessionRef.current += 1;
      pausedRef.current = false;
      readySessionRef.current = 0;
      player.pause();
      queueRef.current = {
        verses,
        mode,
        reciterId,
        language,
        voice,
        rate,
        pitch,
        volume: Math.max(0, Math.min(1, volume)),
        repeats: {
          range: Math.max(1, repeats.range),
          ayah: Math.max(1, repeats.ayah),
          startAt: Math.max(0, Math.min(verses.length - 1, repeats.startAt ?? 0)),
        },
      };
      indexRef.current = queueRef.current.repeats.startAt ?? 0;
      ayahRunRef.current = 1;
      rangeRunRef.current = 1;
      beginAt(indexRef.current, sessionRef.current);
    },
    [beginAt, clearTranslationCache, player],
  );

  const speakSurah = useCallback(
    (verses: TranslationVerse[], language: string, voice?: VoiceProfileId, rate?: number, pitch?: number, volume?: number) => {
      play(verses, 'translation', 'husary', language, voice, rate, pitch, volume);
    },
    [play],
  );
  const speakAyah = useCallback(
    (verse: TranslationVerse, language: string, voice?: VoiceProfileId, rate?: number, pitch?: number, volume?: number) => {
      play([verse], 'translation', 'husary', language, voice, rate, pitch, volume);
    },
    [play],
  );

  const setVolume = useCallback(
    (volume: number) => {
      const next = Math.max(0, Math.min(1, volume));
      if (queueRef.current) queueRef.current = { ...queueRef.current, volume: next };
      setPlayerVolume(player, next);
    },
    [player],
  );

  const stop = useCallback(async () => {
    clearTranslationCache();
    sessionRef.current += 1;
    pausedRef.current = false;
    readySessionRef.current = 0;
    queueRef.current = null;
    phaseRef.current = null;
    player.pause();
    if (localAudioUriRef.current) releaseDownloadedRecitationUri(localAudioUriRef.current);
    localAudioUriRef.current = null;
    setState((current) => ({
      ...current,
      status: 'idle',
      phase: null,
      error: null,
    }));
  }, [clearTranslationCache, player]);
  const reset = useCallback(async () => {
    await stop();
    indexRef.current = 0;
    setState(initialState);
  }, [stop]);

  const pause = useCallback(async () => {
    if (state.status !== 'speaking' && state.status !== 'loading') return;
    pausedRef.current = true;
    player.pause();
    setState((current) => ({ ...current, status: 'paused' }));
  }, [player, state.status]);

  const resume = useCallback(async () => {
    if (state.status !== 'paused' || !queueRef.current) return;
    pausedRef.current = false;
    if (readySessionRef.current === sessionRef.current) {
      player.play();
      setState((current) => ({ ...current, status: 'speaking' }));
    } else {
      setState((current) => ({ ...current, status: 'loading' }));
    }
  }, [player, state.status]);

  useEffect(
    () => () => {
      clearTranslationCache();
      player.pause();
      if (localAudioUriRef.current) releaseDownloadedRecitationUri(localAudioUriRef.current);
    },
    [clearTranslationCache, player],
  );

  const value = useMemo(
    () => ({
      ...state,
      speakAyah,
      speakSurah,
      play,
      pause,
      resume,
      setVolume,
      stop,
      reset,
    }),
    [pause, play, reset, resume, setVolume, speakAyah, speakSurah, state, stop],
  );
  return <SpeechContext.Provider value={value}>{children}</SpeechContext.Provider>;
}

export function useSpeech(): SpeechContextValue {
  const value = useContext(SpeechContext);
  if (!value) throw new Error('useSpeech must be used within SpeechProvider.');
  return value;
}
