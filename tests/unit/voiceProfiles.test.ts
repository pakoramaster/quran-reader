import { getVoiceProfile, isVoiceProfileId, VOICE_PROFILES } from '@/features/speech/domain/voiceProfiles';

describe('translation voice profiles', () => {
  it('offers four stable speakers from the shared voice model', () => {
    expect(VOICE_PROFILES.map((profile) => profile.id)).toEqual(['clear', 'warm', 'calm', 'bright']);
    expect(VOICE_PROFILES.map((profile) => profile.name)).toEqual(['Male 1', 'Male 2', 'Female 1', 'Female 2']);
    expect(VOICE_PROFILES.map((profile) => profile.speakerId)).toEqual([6, 9, 0, 12]);
    expect(new Set(VOICE_PROFILES.map((profile) => profile.speakerId)).size).toBe(4);
    expect(VOICE_PROFILES.filter((profile) => profile.name.startsWith('Male')).length).toBe(2);
    expect(VOICE_PROFILES.filter((profile) => profile.name.startsWith('Female')).length).toBe(2);
    expect(isVoiceProfileId('warm')).toBe(true);
    expect(isVoiceProfileId('device-specific-id')).toBe(false);
    expect(getVoiceProfile(null).id).toBe('clear');
  });
});
