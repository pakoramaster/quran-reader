export type TtsSpeedId = 'slowest' | 'relaxed' | 'normal' | 'fast' | 'faster';

export interface TtsSpeed {
  id: TtsSpeedId;
  label: string;
  description: string;
  value: number;
}

export const TTS_SPEEDS: readonly TtsSpeed[] = [
  { id: 'relaxed', label: 'Relaxed', description: '1.0× speed', value: 1 },
  { id: 'normal', label: 'Normal', description: '1.1× speed', value: 1.1 },
  { id: 'fast', label: 'Fast', description: '1.2× speed', value: 1.2 },
  { id: 'faster', label: 'Faster', description: '1.3× speed', value: 1.3 },
] as const;

export const SYSTEM_TTS_SPEEDS: readonly TtsSpeed[] = [
  { id: 'slowest', label: 'Slowest', description: '0.5× device speed', value: 0.9 },
  ...TTS_SPEEDS,
] as const;

export const DEFAULT_TTS_SPEED_ID: TtsSpeedId = 'normal';

export function isTtsSpeedId(value: string | null | undefined): value is TtsSpeedId {
  return SYSTEM_TTS_SPEEDS.some((speed) => speed.id === value);
}

export function getTtsSpeed(value: string | null | undefined): TtsSpeed {
  return SYSTEM_TTS_SPEEDS.find((speed) => speed.id === value) ?? TTS_SPEEDS[1]!;
}

export function clampTtsSpeed(value: number): number {
  return Number.isFinite(value) ? Math.max(0.5, Math.min(2, value)) : 1;
}
