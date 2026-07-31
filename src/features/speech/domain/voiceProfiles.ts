import type { Voice } from 'expo-speech';

export type VoiceProfileId = 'clear' | 'warm' | 'calm' | 'bright';

export interface VoiceProfile {
  id: VoiceProfileId;
  name: string;
  description: string;
  rate: number;
  pitch: number;
}

export const VOICE_PROFILES: readonly VoiceProfile[] = [
  { id: 'clear', name: 'Clear', description: 'Balanced and articulate', rate: 0.92, pitch: 1 },
  { id: 'warm', name: 'Warm', description: 'Measured and lower', rate: 0.86, pitch: 0.9 },
  { id: 'calm', name: 'Calm', description: 'Gentle and unhurried', rate: 0.8, pitch: 0.96 },
  { id: 'bright', name: 'Bright', description: 'Lighter and more energetic', rate: 1, pitch: 1.08 },
] as const;

export const DEFAULT_VOICE_PROFILE_ID: VoiceProfileId = 'clear';

export function isVoiceProfileId(value: string | null | undefined): value is VoiceProfileId {
  return VOICE_PROFILES.some((profile) => profile.id === value);
}

export function getVoiceProfile(value: string | null | undefined): VoiceProfile {
  return VOICE_PROFILES.find((profile) => profile.id === value) ?? VOICE_PROFILES[0]!;
}

export function resolveVoiceForProfile(
  voices: Voice[],
  language: string,
  profileId: VoiceProfileId,
): Voice | undefined {
  const baseLanguage = language.toLowerCase().split('-')[0];
  const matching = voices
    .filter((voice) => voice.language.toLowerCase().split('-')[0] === baseLanguage)
    .sort((a, b) => {
      if (a.quality !== b.quality) return a.quality === 'Enhanced' ? -1 : 1;
      return `${a.name}:${a.identifier}`.localeCompare(`${b.name}:${b.identifier}`);
    });
  if (!matching.length) return undefined;
  const index = VOICE_PROFILES.findIndex((profile) => profile.id === profileId);
  return matching[index % matching.length];
}
