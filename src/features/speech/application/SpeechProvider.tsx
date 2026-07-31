import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { getRecitationUrl, type PlaybackMode, type ReciterId } from '@/features/recitation/domain/reciters';
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
  speakAyah: (verse: TranslationVerse, language: string, voice?: string, rate?: number, pitch?: number, volume?: number) => void;
  speakSurah: (verses: TranslationVerse[], language: string, voice?: string, rate?: number, pitch?: number, volume?: number) => void;
  play: (verses: PlaybackVerse[], mode: PlaybackMode, reciterId: ReciterId, language?: string, voice?: string, rate?: number, pitch?: number, volume?: number, repeats?: PlaybackRepeats) => void;
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
  voice?: string;
  rate: number;
  pitch: number;
  volume: number;
  repeats: PlaybackRepeats;
}

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

export function SpeechProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SpeechState>(initialState);
  const player = useAudioPlayer(null, { updateInterval: 250, keepAudioSessionActive: true });
  const playerStatus = useAudioPlayerStatus(player);
  const queueRef = useRef<QueueConfig | null>(null);
  const indexRef = useRef(0);
  const phaseRef = useRef<PlaybackPhase | null>(null);
  const ayahRunRef = useRef(1);
  const rangeRunRef = useRef(1);
  const sessionRef = useRef(0);
  const advanceRef = useRef<(session: number) => void>(() => undefined);

  const beginTranslation = useCallback((index: number, session: number) => {
    const queue = queueRef.current;
    const verse = queue?.verses[index];
    if (!queue || !verse || session !== sessionRef.current) return;
    phaseRef.current = 'translation';
    setState({
      status: 'speaking',
      currentVerseKey: verse.key,
      phase: 'translation',
      error: null,
      rangeIteration: rangeRunRef.current,
      rangeRepeat: queue.repeats.range,
    });
    const chunks: string[] = [];
    for (let cursor = 0; cursor < verse.text.length; cursor += Speech.maxSpeechInputLength) {
      chunks.push(verse.text.slice(cursor, cursor + Speech.maxSpeechInputLength));
    }
    let chunkIndex = 0;
    const speakChunk = () => {
      if (session !== sessionRef.current) return;
      const chunk = chunks[chunkIndex];
      if (!chunk) {
        advanceRef.current(session);
        return;
      }
      Speech.speak(chunk, {
        language: queue.language,
        voice: queue.voice,
        rate: queue.rate,
        pitch: queue.pitch,
        volume: queue.volume,
        onDone: () => { chunkIndex += 1; speakChunk(); },
        onError: (error) => {
          if (session === sessionRef.current) setState({
            status: 'error',
            currentVerseKey: verse.key,
            phase: 'translation',
            error: error.message || 'Translation speech failed.',
            rangeIteration: rangeRunRef.current,
            rangeRepeat: queue.repeats.range,
          });
        },
      });
    };
    speakChunk();
  }, []);

  const beginRecitation = useCallback((index: number, session: number) => {
    const queue = queueRef.current;
    const verse = queue?.verses[index];
    if (!queue || !verse || session !== sessionRef.current) return;
    phaseRef.current = 'recitation';
    setState({
      status: 'loading',
      currentVerseKey: verse.key,
      phase: 'recitation',
      error: null,
      rangeIteration: rangeRunRef.current,
      rangeRepeat: queue.repeats.range,
    });
    setPlayerVolume(player, queue.volume);
    player.replace({ uri: getRecitationUrl(queue.reciterId, verse.key), name: verse.key });
    player.play();
  }, [player]);

  const beginAt = useCallback((index: number, session: number) => {
    const queue = queueRef.current;
    const verse = queue?.verses[index];
    if (!queue || !verse || session !== sessionRef.current) {
      phaseRef.current = null;
      setState((current) => ({ ...current, status: 'idle', phase: null, error: null }));
      return;
    }
    indexRef.current = index;
    if (queue.mode === 'translation') beginTranslation(index, session);
    else beginRecitation(index, session);
  }, [beginRecitation, beginTranslation]);

  const advance = useCallback((session: number) => {
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
  }, [beginAt, beginTranslation]);

  useEffect(() => { advanceRef.current = advance; }, [advance]);
  useEffect(() => {
    if (phaseRef.current !== 'recitation') return;
    if (playerStatus.error) {
      // Audio status is an external native event reflected into React state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState((current) => ({ ...current, status: 'error', error: 'Recitation could not be streamed. Check your connection and try again.' }));
    } else if (playerStatus.didJustFinish) {
      advanceRef.current(sessionRef.current);
    } else if (playerStatus.playing) {
      // Audio status is an external native event reflected into React state.
      setState((current) => ({ ...current, status: 'speaking', error: null }));
    }
  }, [playerStatus.didJustFinish, playerStatus.error, playerStatus.playing]);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix', shouldPlayInBackground: true });
  }, []);

  const play = useCallback((verses: PlaybackVerse[], mode: PlaybackMode, reciterId: ReciterId, language = 'en', voice?: string, rate = 0.9, pitch = 1, volume = 1, repeats: PlaybackRepeats = { range: 1, ayah: 1 }) => {
    sessionRef.current += 1;
    player.pause();
    void Speech.stop();
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
  }, [beginAt, player]);

  const speakSurah = useCallback((verses: TranslationVerse[], language: string, voice?: string, rate?: number, pitch?: number, volume?: number) => {
    play(verses, 'translation', 'husary', language, voice, rate, pitch, volume);
  }, [play]);
  const speakAyah = useCallback((verse: TranslationVerse, language: string, voice?: string, rate?: number, pitch?: number, volume?: number) => {
    play([verse], 'translation', 'husary', language, voice, rate, pitch, volume);
  }, [play]);

  const setVolume = useCallback((volume: number) => {
    const next = Math.max(0, Math.min(1, volume));
    if (queueRef.current) queueRef.current = { ...queueRef.current, volume: next };
    setPlayerVolume(player, next);
  }, [player]);

  const stop = useCallback(async () => {
    sessionRef.current += 1;
    queueRef.current = null;
    phaseRef.current = null;
    player.pause();
    await Speech.stop();
    setState((current) => ({ ...current, status: 'idle', phase: null, error: null }));
  }, [player]);
  const reset = useCallback(async () => { await stop(); indexRef.current = 0; setState(initialState); }, [stop]);

  const pause = useCallback(async () => {
    if (state.status !== 'speaking' && state.status !== 'loading') return;
    if (phaseRef.current === 'recitation') player.pause();
    else if (Platform.OS === 'ios') await Speech.pause();
    else { sessionRef.current += 1; await Speech.stop(); }
    setState((current) => ({ ...current, status: 'paused' }));
  }, [player, state.status]);

  const resume = useCallback(async () => {
    if (state.status !== 'paused' || !queueRef.current) return;
    if (phaseRef.current === 'recitation') { player.play(); setState((current) => ({ ...current, status: 'speaking' })); }
    else if (Platform.OS === 'ios') { await Speech.resume(); setState((current) => ({ ...current, status: 'speaking' })); }
    else { sessionRef.current += 1; beginTranslation(indexRef.current, sessionRef.current); }
  }, [beginTranslation, player, state.status]);

  useEffect(() => () => { player.pause(); void Speech.stop(); }, [player]);

  const value = useMemo(() => ({ ...state, speakAyah, speakSurah, play, pause, resume, setVolume, stop, reset }), [pause, play, reset, resume, setVolume, speakAyah, speakSurah, state, stop]);
  return <SpeechContext.Provider value={value}>{children}</SpeechContext.Provider>;
}

export function useSpeech(): SpeechContextValue {
  const value = useContext(SpeechContext);
  if (!value) throw new Error('useSpeech must be used within SpeechProvider.');
  return value;
}
