import { Ionicons } from '@expo/vector-icons';
import type { ChangeEvent, CSSProperties } from 'react';

import { colors } from '@/theme/tokens';

interface CompactVolumeControlProps {
  value: number;
  onChange: (value: number) => void;
}

const wrapperStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 6,
  width: 122,
};

const sliderStyle: CSSProperties = {
  accentColor: colors.emerald,
  cursor: 'pointer',
  height: 24,
  margin: 0,
  minWidth: 0,
  width: 94,
};

export function CompactVolumeControl({ value, onChange }: CompactVolumeControlProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.currentTarget.value));
  return (
    <div style={wrapperStyle}>
      <Ionicons color={colors.emerald} name={value === 0 ? 'volume-mute' : value < 0.5 ? 'volume-low' : 'volume-high'} size={18} />
      <input
        aria-label="Playback volume"
        max={1}
        min={0}
        onChange={handleChange}
        step={0.05}
        style={sliderStyle}
        type="range"
        value={value}
      />
    </div>
  );
}
