import type { CSSProperties } from 'react';

export function normalizeWebTextInputStyle(style: CSSProperties, multiline: boolean): CSSProperties {
  const lineHeight = typeof style.lineHeight === 'number' ? `${style.lineHeight}px` : style.lineHeight;
  return {
    ...style,
    boxSizing: 'border-box',
    flex: multiline ? '0 0 150px' : style.flex,
    height: multiline ? 150 : style.height,
    lineHeight,
    maxHeight: multiline ? 150 : style.maxHeight,
    minHeight: multiline ? 150 : style.minHeight,
    outlineColor: 'transparent',
    pointerEvents: 'auto',
    resize: multiline ? 'none' : undefined,
    userSelect: 'text',
  };
}
