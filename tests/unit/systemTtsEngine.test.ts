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
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import * as Speech from 'expo-speech';

import { listSystemVoices, pauseSystemVoice, resumeSystemVoice, speakWithSystemVoice, systemVoiceCanResume } from '@/features/speech/data/systemTtsEngine';

describe('system TTS adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  it('resumes Android speech from the most recent word boundary', async () => {
    speakWithSystemVoice('First second third', {
      language: 'en',
      onDone: jest.fn(),
      onError: jest.fn(),
      onStart: jest.fn(),
      onStopped: jest.fn(),
      pitch: 1,
      rate: 1,
      volume: 1,
    });

    const firstOptions = jest.mocked(Speech.speak).mock.calls[0]?.[1];
    if (!firstOptions?.onBoundary || typeof firstOptions.onBoundary !== 'function') throw new Error('Expected an Android word-boundary callback.');
    const onBoundary = firstOptions.onBoundary as (event: { charIndex: number; charLength: number }) => void;
    onBoundary({ charIndex: 6, charLength: 6 });

    await pauseSystemVoice();
    expect(systemVoiceCanResume()).toBe(true);
    await resumeSystemVoice();

    expect(Speech.speak).toHaveBeenLastCalledWith('second third.', expect.objectContaining({ language: 'en', voice: undefined }));
    expect(Speech.resume).not.toHaveBeenCalled();
  });
});
