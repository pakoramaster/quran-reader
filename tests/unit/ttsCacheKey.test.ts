import { buildTtsCacheKey } from '@/features/speech/domain/ttsCacheKey';

describe('TTS cache keys', () => {
  it('preserves every cache field without native string terminators', () => {
    const key = buildTtsCacheKey('kokoro', 6, 1, 'A translated verse');

    expect(key).not.toContain('\u0000');
    expect(JSON.parse(key)).toEqual({ model: 'kokoro', speakerId: 6, speed: 1, text: 'A translated verse', version: 2 });
  });

  it('uses a different key for every translation text', () => {
    expect(buildTtsCacheKey('kokoro', 6, 1, 'Verse one')).not.toBe(buildTtsCacheKey('kokoro', 6, 1, 'Verse two'));
  });
});
