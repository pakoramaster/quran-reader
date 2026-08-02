export type SpeechEngineId = 'kokoro' | 'system';

export interface SpeechEngineOption {
  id: SpeechEngineId;
  name: string;
  description: string;
}

export const SPEECH_ENGINES: readonly SpeechEngineOption[] = [
  {
    id: 'kokoro',
    name: 'Quran Folio voices',
    description: 'Consistent private offline voices from the included Kokoro model.',
  },
  {
    id: 'system',
    name: 'Device voice',
    description: 'Uses an installed Android, Apple, or Windows voice for faster startup.',
  },
] as const;

export const DEFAULT_SPEECH_ENGINE_ID: SpeechEngineId = 'kokoro';

export function isSpeechEngineId(value: string | null | undefined): value is SpeechEngineId {
  return SPEECH_ENGINES.some((engine) => engine.id === value);
}
