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

import type { TranslationVerse, VerseKey } from '@/types/domain';

type SpeechStatus = 'idle' | 'speaking' | 'paused' | 'error';

interface SpeechState {
  status: SpeechStatus;
  currentVerseKey: VerseKey | null;
  error: string | null;
}

interface SpeechContextValue extends SpeechState {
  speakAyah: (verse: TranslationVerse, language: string, voice?: string, rate?: number) => void;
  speakSurah: (verses: TranslationVerse[], language: string, voice?: string, rate?: number) => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
}

interface QueueConfig {
  verses: TranslationVerse[];
  language: string;
  voice?: string;
  rate: number;
}

const initialState: SpeechState = { status: 'idle', currentVerseKey: null, error: null };
const SpeechContext = createContext<SpeechContextValue | null>(null);

export function SpeechProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SpeechState>(initialState);
  const queueRef = useRef<QueueConfig | null>(null);
  const indexRef = useRef(0);
  const sessionRef = useRef(0);
  const playAtRef = useRef<(index: number, session: number) => void>(() => undefined);

  const playAt = useCallback((index: number, session: number) => {
    const queue = queueRef.current;
    if (!queue || session !== sessionRef.current || index >= queue.verses.length) {
      setState(initialState);
      return;
    }
    const verse = queue.verses[index];
    if (!verse) return;
    indexRef.current = index;
    setState({ status: 'speaking', currentVerseKey: verse.key, error: null });
    const chunks: string[] = [];
    for (let cursor = 0; cursor < verse.text.length; cursor += Speech.maxSpeechInputLength) {
      chunks.push(verse.text.slice(cursor, cursor + Speech.maxSpeechInputLength));
    }
    let chunkIndex = 0;
    const speakChunk = () => {
      if (session !== sessionRef.current) return;
      const chunk = chunks[chunkIndex];
      if (!chunk) {
        playAtRef.current(index + 1, session);
        return;
      }
      Speech.speak(chunk, {
        language: queue.language,
        voice: queue.voice,
        rate: queue.rate,
        onDone: () => {
          chunkIndex += 1;
          speakChunk();
        },
        onError: (error) => {
          if (session !== sessionRef.current) return;
          setState({ status: 'error', currentVerseKey: verse.key, error: error.message || 'Speech failed.' });
        },
      });
    };
    speakChunk();
  }, []);

  useEffect(() => {
    playAtRef.current = playAt;
  }, [playAt]);

  const start = useCallback(
    (verses: TranslationVerse[], language: string, voice?: string, rate = 0.9) => {
      sessionRef.current += 1;
      void Speech.stop();
      queueRef.current = { verses, language, voice, rate };
      indexRef.current = 0;
      playAt(0, sessionRef.current);
    },
    [playAt],
  );

  const speakAyah = useCallback(
    (verse: TranslationVerse, language: string, voice?: string, rate?: number) =>
      start([verse], language, voice, rate),
    [start],
  );
  const speakSurah = useCallback(
    (verses: TranslationVerse[], language: string, voice?: string, rate?: number) =>
      start(verses, language, voice, rate),
    [start],
  );

  const stop = useCallback(async () => {
    sessionRef.current += 1;
    queueRef.current = null;
    await Speech.stop();
    setState(initialState);
  }, []);

  const pause = useCallback(async () => {
    if (state.status !== 'speaking') return;
    if (Platform.OS === 'ios') {
      await Speech.pause();
    } else {
      sessionRef.current += 1;
      await Speech.stop();
    }
    setState((current) => ({ ...current, status: 'paused' }));
  }, [state.status]);

  const resume = useCallback(async () => {
    if (state.status !== 'paused' || !queueRef.current) return;
    if (Platform.OS === 'ios') {
      await Speech.resume();
      setState((current) => ({ ...current, status: 'speaking' }));
    } else {
      sessionRef.current += 1;
      playAt(indexRef.current, sessionRef.current);
    }
  }, [playAt, state.status]);

  useEffect(() => () => void Speech.stop(), []);

  const value = useMemo(
    () => ({ ...state, speakAyah, speakSurah, pause, resume, stop }),
    [pause, resume, speakAyah, speakSurah, state, stop],
  );
  return <SpeechContext.Provider value={value}>{children}</SpeechContext.Provider>;
}

export function useSpeech(): SpeechContextValue {
  const value = useContext(SpeechContext);
  if (!value) throw new Error('useSpeech must be used within SpeechProvider.');
  return value;
}
