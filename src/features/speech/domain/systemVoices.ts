export const DEFAULT_SYSTEM_VOICE_ID = 'default';

export interface SystemVoice {
  identifier: string;
  language: string;
  name: string;
  quality: 'Default' | 'Enhanced';
}

function baseLanguage(language: string): string {
  return language.trim().toLowerCase().replace(/_/g, '-').split('-')[0] ?? '';
}

export function filterSystemVoices(voices: readonly SystemVoice[], language: string): SystemVoice[] {
  const requestedLanguage = baseLanguage(language);
  const matching = requestedLanguage ? voices.filter((voice) => baseLanguage(voice.language) === requestedLanguage) : [];
  const selected = matching.length ? matching : voices;
  return [...selected].sort((left, right) => left.name.localeCompare(right.name) || left.language.localeCompare(right.language));
}

export function getSystemSpeechRate(kokoroRate: number): number {
  if (kokoroRate <= 1) return 0.8;
  if (kokoroRate <= 1.1) return 1;
  if (kokoroRate <= 1.2) return 1.25;
  return 1.5;
}
