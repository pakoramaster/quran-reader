import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
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

import { type PlaybackMode, type ReciterId } from '@/features/recitation/domain/reciters';
import { releaseDownloadedRecitationUri } from '@/features/recitation/data/recitationFileStore';
import { resolveRecitationPlaybackSource } from '@/features/recitation/data/recitationPlaybackSource';
import { releaseUniformSpeechUri, synthesizeUniformSpeech } from '@/features/speech/data/uniformTtsEngine';
import { DEFAULT_VOICE_PROFILE_ID, type VoiceProfileId } from '@/features/speech/domain/voiceProfiles';
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
  play: (verses: PlaybackVerse[], mode: PlaybackMode, reciterId: ReciterId, language?: string, voice?: VoiceProfileId, rate?: number, pitch?: number, volume?: number, repeats?: PlaybackRepeats) => void;
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
  const translationAudioUriRef = useRef<string | null>(null);

  const beginTranslation = useCallback((index: number, session: number) => {
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
    setPlayerVolume(player, queue.volume);
    void synthesizeUniformSpeech(verse.text, queue.voice).then((uri) => {
      if (session !== sessionRef.current) {
        releaseUniformSpeechUri(uri);
        return;
      }
      if (translationAudioUriRef.current) releaseUniformSpeechUri(translationAudioUriRef.current);
      translationAudioUriRef.current = uri;
      player.replace({ uri, name: `Translation ${verse.key}` });
      readySessionRef.current = session;
      if (pausedRef.current) setState((current) => ({ ...current, status: 'paused' }));
      else player.play();
    }).catch((error) => {
      if (session === sessionRef.current) setState({
        status: 'error',
        currentVerseKey: verse.key,
        phase: 'translation',
        error: error instanceof Error ? error.message : 'Translation speech failed.',
        rangeIteration: rangeRunRef.current,
        rangeRepeat: queue.repeats.range,
      });
    });
  }, [player]);

  const beginRecitation = useCallback((index: number, session: number) => {
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
    setPlayerVolume(player, queue.volume);
    void resolveRecitationPlaybackSource(queue.reciterId, verse.key).then(({ uri, localUri }) => {
      if (session !== sessionRef.current) {
        if (localUri) releaseDownloadedRecitationUri(localUri);
        return;
      }
      if (localAudioUriRef.current) releaseDownloadedRecitationUri(localAudioUriRef.current);
      localAudioUriRef.current = localUri;
      player.replace({ uri, name: verse.key });
      readySessionRef.current = session;
      if (pausedRef.current) setState((current) => ({ ...current, status: 'paused' }));
      else player.play();
    });
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
    if (!phaseRef.current) return;
    if (playerStatus.error) {
      // Audio status is an external native event reflected into React state.
      setState((current) => ({
        ...current,
        status: 'error',
        error: phaseRef.current === 'recitation'
          ? 'Recitation could not be played. Check the download or your connection and try again.'
          : 'Translation speech could not be played.',
      }));
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

  const play = useCallback((verses: PlaybackVerse[], mode: PlaybackMode, reciterId: ReciterId, language = 'en', voice: VoiceProfileId = DEFAULT_VOICE_PROFILE_ID, rate = 0.9, pitch = 1, volume = 1, repeats: PlaybackRepeats = { range: 1, ayah: 1 }) => {
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
  }, [beginAt, player]);

  const speakSurah = useCallback((verses: TranslationVerse[], language: string, voice?: VoiceProfileId, rate?: number, pitch?: number, volume?: number) => {
    play(verses, 'translation', 'husary', language, voice, rate, pitch, volume);
  }, [play]);
  const speakAyah = useCallback((verse: TranslationVerse, language: string, voice?: VoiceProfileId, rate?: number, pitch?: number, volume?: number) => {
    play([verse], 'translation', 'husary', language, voice, rate, pitch, volume);
  }, [play]);

  const setVolume = useCallback((volume: number) => {
    const next = Math.max(0, Math.min(1, volume));
    if (queueRef.current) queueRef.current = { ...queueRef.current, volume: next };
    setPlayerVolume(player, next);
  }, [player]);

  const stop = useCallback(async () => {
    sessionRef.current += 1;
    pausedRef.current = false;
    readySessionRef.current = 0;
    queueRef.current = null;
    phaseRef.current = null;
    player.pause();
    if (localAudioUriRef.current) releaseDownloadedRecitationUri(localAudioUriRef.current);
    localAudioUriRef.current = null;
    if (translationAudioUriRef.current) releaseUniformSpeechUri(translationAudioUriRef.current);
    translationAudioUriRef.current = null;
    setState((current) => ({ ...current, status: 'idle', phase: null, error: null }));
  }, [player]);
  const reset = useCallback(async () => { await stop(); indexRef.current = 0; setState(initialState); }, [stop]);

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

  useEffect(() => () => {
    player.pause();
    if (localAudioUriRef.current) releaseDownloadedRecitationUri(localAudioUriRef.current);
    if (translationAudioUriRef.current) releaseUniformSpeechUri(translationAudioUriRef.current);
  }, [player]);

  const value = useMemo(() => ({ ...state, speakAyah, speakSurah, play, pause, resume, setVolume, stop, reset }), [pause, play, reset, resume, setVolume, speakAyah, speakSurah, state, stop]);
  return <SpeechContext.Provider value={value}>{children}</SpeechContext.Provider>;
}

export function useSpeech(): SpeechContextValue {
  const value = useContext(SpeechContext);
  if (!value) throw new Error('useSpeech must be used within SpeechProvider.');
  return value;
}
