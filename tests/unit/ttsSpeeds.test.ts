import {
  clampTtsSpeed,
  DEFAULT_TTS_SPEED_ID,
  getTtsSpeed,
  isTtsSpeedId,
  SYSTEM_TTS_SPEEDS,
  TTS_SPEEDS,
} from '@/features/speech/domain/ttsSpeeds';

describe('translation speech speeds', () => {
  it('offers stable, progressively faster choices', () => {
    expect(DEFAULT_TTS_SPEED_ID).toBe('normal');
    expect(TTS_SPEEDS.map((speed) => speed.value)).toEqual([1, 1.1, 1.2, 1.3]);
    expect(SYSTEM_TTS_SPEEDS.map((speed) => speed.value)).toEqual([0.9, 1, 1.1, 1.2, 1.3]);
    expect(isTtsSpeedId('fast')).toBe(true);
    expect(isTtsSpeedId('slowest')).toBe(true);
    expect(isTtsSpeedId('device-default')).toBe(false);
    expect(getTtsSpeed(null).value).toBe(1.1);
  });

  it('keeps synthesis input within the supported range', () => {
    expect(clampTtsSpeed(0.1)).toBe(0.5);
    expect(clampTtsSpeed(1.4)).toBe(1.4);
    expect(clampTtsSpeed(4)).toBe(2);
    expect(clampTtsSpeed(Number.NaN)).toBe(1);
  });
});
