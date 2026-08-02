jest.mock('expo-speech', () => ({
  getAvailableVoicesAsync: jest.fn(async () => [
    { identifier: 'fr', language: 'fr-FR', name: 'Amelie', quality: 'Default' },
    { identifier: 'en', language: 'en-US', name: 'Ava', quality: 'Enhanced' },
  ]),
  pause: jest.fn(async () => undefined),
  resume: jest.fn(async () => undefined),
  speak: jest.fn(),
  stop: jest.fn(async () => undefined),
}));

import * as Speech from 'expo-speech';

import { listSystemVoices, speakWithSystemVoice } from '@/features/speech/data/systemTtsEngine';

describe('system TTS adapter', () => {
  it('passes the selected voice and mapped speed to the operating system', () => {
    speakWithSystemVoice('A translated verse', {
      language: 'en',
      onDone: jest.fn(),
      onError: jest.fn(),
      onStart: jest.fn(),
      onStopped: jest.fn(),
      pitch: 1,
      rate: 1.3,
      voice: 'en',
      volume: 0.7,
    });

    expect(Speech.speak).toHaveBeenCalledWith(
      'A translated verse.',
      expect.objectContaining({ language: 'en', rate: 1.5, voice: 'en', volume: 0.7 }),
    );
  });

  it('lists voices matching the translation language', async () => {
    await expect(listSystemVoices('en-CA')).resolves.toEqual([
      { identifier: 'en', language: 'en-US', name: 'Ava', quality: 'Enhanced' },
    ]);
  });
});
