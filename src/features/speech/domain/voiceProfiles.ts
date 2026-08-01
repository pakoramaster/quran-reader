export type VoiceProfileId = 'clear' | 'warm' | 'calm' | 'bright';

export interface VoiceProfile {
  id: VoiceProfileId;
  name: string;
  description: string;
  speakerId: number;
  rate: number;
}

export const VOICE_PROFILES: readonly VoiceProfile[] = [
  { id: 'clear', name: 'Cedar', description: 'Male · balanced and articulate', speakerId: 0, rate: 0.92 },
  { id: 'warm', name: 'Pearl', description: 'Female · warm and measured', speakerId: 1, rate: 0.9 },
  { id: 'calm', name: 'Reed', description: 'Male · calm and unhurried', speakerId: 2, rate: 0.86 },
  { id: 'bright', name: 'Lark', description: 'Female · light and expressive', speakerId: 3, rate: 0.96 },
] as const;

export const DEFAULT_VOICE_PROFILE_ID: VoiceProfileId = 'clear';

export function isVoiceProfileId(value: string | null | undefined): value is VoiceProfileId {
  return VOICE_PROFILES.some((profile) => profile.id === value);
}

export function getVoiceProfile(value: string | null | undefined): VoiceProfile {
  return VOICE_PROFILES.find((profile) => profile.id === value) ?? VOICE_PROFILES[0]!;
}
