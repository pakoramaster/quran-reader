import { getVoiceProfile, isVoiceProfileId, resolveVoiceForProfile, VOICE_PROFILES } from '@/features/speech/domain/voiceProfiles';
import { VoiceQuality, type Voice } from 'expo-speech';

describe('translation voice profiles', () => {
  const voices: Voice[] = [
    { identifier: 'zulu', name: 'Zulu', language: 'en-US', quality: VoiceQuality.Default },
    { identifier: 'alpha', name: 'Alpha', language: 'en-GB', quality: VoiceQuality.Enhanced },
    { identifier: 'french', name: 'Français', language: 'fr-FR', quality: VoiceQuality.Enhanced },
  ];

  it('offers four stable app-level profiles', () => {
    expect(VOICE_PROFILES.map((profile) => profile.id)).toEqual(['clear', 'warm', 'calm', 'bright']);
    expect(isVoiceProfileId('warm')).toBe(true);
    expect(isVoiceProfileId('device-specific-id')).toBe(false);
    expect(getVoiceProfile(null).id).toBe('clear');
  });

  it('resolves profiles deterministically within the requested language', () => {
    expect(resolveVoiceForProfile(voices, 'en', 'clear')?.identifier).toBe('alpha');
    expect(resolveVoiceForProfile(voices, 'en-US', 'warm')?.identifier).toBe('zulu');
    expect(resolveVoiceForProfile(voices, 'fr', 'clear')?.identifier).toBe('french');
    expect(resolveVoiceForProfile(voices, 'ar', 'clear')).toBeUndefined();
  });
});
