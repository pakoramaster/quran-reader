export type VoiceProfileId = 'clear' | 'warm' | 'calm' | 'bright';

export interface VoiceProfile {
  id: VoiceProfileId;
  name: string;
  description: string;
  speakerId: number;
}

export const VOICE_PROFILES: readonly VoiceProfile[] = [
  { id: 'clear', name: 'Male 1', description: '', speakerId: 6 },
  { id: 'warm', name: 'Male 2', description: '', speakerId: 9 },
  { id: 'calm', name: 'Female 1', description: '', speakerId: 0 },
  { id: 'bright', name: 'Female 2', description: '', speakerId: 8 },
] as const;

export const DEFAULT_VOICE_PROFILE_ID: VoiceProfileId = 'clear';

export function isVoiceProfileId(value: string | null | undefined): value is VoiceProfileId {
  return VOICE_PROFILES.some((profile) => profile.id === value);
}

export function getVoiceProfile(value: string | null | undefined): VoiceProfile {
  return VOICE_PROFILES.find((profile) => profile.id === value) ?? VOICE_PROFILES[0]!;
}
