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
}

interface PlaybackVerse extends TranslationVerse {
  text: string;
}

interface SpeechContextValue extends SpeechState {
  speakAyah: (verse: TranslationVerse, language: string, voice?: string, rate?: number) => void;
  speakSurah: (verses: TranslationVerse[], language: string, voice?: string, rate?: number) => void;
  play: (verses: PlaybackVerse[], mode: PlaybackMode, reciterId: ReciterId, language?: string, voice?: string, rate?: number) => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => Promise<void>;
}

interface QueueConfig {
  verses: PlaybackVerse[];
  mode: PlaybackMode;
  reciterId: ReciterId;
  language: string;
  voice?: string;
  rate: number;
}

const initialState: SpeechState = { status: 'idle', currentVerseKey: null, phase: null, error: null };
const SpeechContext = createContext<SpeechContextValue | null>(null);

export function SpeechProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SpeechState>(initialState);
  const player = useAudioPlayer(null, { updateInterval: 250, keepAudioSessionActive: true });
  const playerStatus = useAudioPlayerStatus(player);
  const queueRef = useRef<QueueConfig | null>(null);
  const indexRef = useRef(0);
  const phaseRef = useRef<PlaybackPhase | null>(null);
  const sessionRef = useRef(0);
  const advanceRef = useRef<(session: number) => void>(() => undefined);

  const beginTranslation = useCallback((index: number, session: number) => {
    const queue = queueRef.current;
    const verse = queue?.verses[index];
    if (!queue || !verse || session !== sessionRef.current) return;
    phaseRef.current = 'translation';
    setState({ status: 'speaking', currentVerseKey: verse.key, phase: 'translation', error: null });
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
        onDone: () => { chunkIndex += 1; speakChunk(); },
        onError: (error) => {
          if (session === sessionRef.current) setState({ status: 'error', currentVerseKey: verse.key, phase: 'translation', error: error.message || 'Translation speech failed.' });
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
    setState({ status: 'loading', currentVerseKey: verse.key, phase: 'recitation', error: null });
    player.replace({ uri: getRecitationUrl(queue.reciterId, verse.key), name: verse.key });
    player.play();
  }, [player]);

  const beginAt = useCallback((index: number, session: number) => {
    const queue = queueRef.current;
    const verse = queue?.verses[index];
    if (!queue || !verse || session !== sessionRef.current) {
      phaseRef.current = null;
      setState((current) => ({ status: 'idle', currentVerseKey: current.currentVerseKey, phase: null, error: null }));
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
    } else {
      beginAt(indexRef.current + 1, session);
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

  const play = useCallback((verses: PlaybackVerse[], mode: PlaybackMode, reciterId: ReciterId, language = 'en', voice?: string, rate = 0.9) => {
    sessionRef.current += 1;
    player.pause();
    void Speech.stop();
    queueRef.current = { verses, mode, reciterId, language, voice, rate };
    indexRef.current = 0;
    beginAt(0, sessionRef.current);
  }, [beginAt, player]);

  const speakSurah = useCallback((verses: TranslationVerse[], language: string, voice?: string, rate?: number) => {
    play(verses, 'translation', 'husary', language, voice, rate);
  }, [play]);
  const speakAyah = useCallback((verse: TranslationVerse, language: string, voice?: string, rate?: number) => {
    play([verse], 'translation', 'husary', language, voice, rate);
  }, [play]);

  const stop = useCallback(async () => {
    sessionRef.current += 1;
    queueRef.current = null;
    phaseRef.current = null;
    player.pause();
    await Speech.stop();
    setState((current) => ({ status: 'idle', currentVerseKey: current.currentVerseKey, phase: null, error: null }));
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

  const value = useMemo(() => ({ ...state, speakAyah, speakSurah, play, pause, resume, stop, reset }), [pause, play, reset, resume, speakAyah, speakSurah, state, stop]);
  return <SpeechContext.Provider value={value}>{children}</SpeechContext.Provider>;
}

export function useSpeech(): SpeechContextValue {
  const value = useContext(SpeechContext);
  if (!value) throw new Error('useSpeech must be used within SpeechProvider.');
  return value;
}
