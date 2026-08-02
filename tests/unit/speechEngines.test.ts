import { DEFAULT_SPEECH_ENGINE_ID, isSpeechEngineId, SPEECH_ENGINES } from '@/features/speech/domain/speechEngines';

describe('translation speech engines', () => {
  it('offers bundled and operating-system speech', () => {
    expect(SPEECH_ENGINES.map((engine) => engine.id)).toEqual(['kokoro', 'system']);
    expect(DEFAULT_SPEECH_ENGINE_ID).toBe('kokoro');
    expect(isSpeechEngineId('system')).toBe(true);
    expect(isSpeechEngineId('browser-specific')).toBe(false);
  });
});
