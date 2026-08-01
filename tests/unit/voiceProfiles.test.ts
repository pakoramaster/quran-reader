import { getVoiceProfile, isVoiceProfileId, VOICE_PROFILES } from '@/features/speech/domain/voiceProfiles';

describe('translation voice profiles', () => {
  it('offers four stable speakers from the shared voice model', () => {
    expect(VOICE_PROFILES.map((profile) => profile.id)).toEqual(['clear', 'warm', 'calm', 'bright']);
    expect(VOICE_PROFILES.map((profile) => profile.speakerId)).toEqual([0, 1, 2, 3]);
    expect(new Set(VOICE_PROFILES.map((profile) => profile.speakerId)).size).toBe(4);
    expect(isVoiceProfileId('warm')).toBe(true);
    expect(isVoiceProfileId('device-specific-id')).toBe(false);
    expect(getVoiceProfile(null).id).toBe('clear');
  });
});
