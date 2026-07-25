import { normalizeWebTextInputStyle } from '@/platform/ui/webTextInputStyle';

describe('normalizeWebTextInputStyle', () => {
  it('removes native browser chrome by default', () => {
    expect(normalizeWebTextInputStyle({}, false)).toMatchObject({
      appearance: 'none',
      backgroundColor: 'transparent',
      border: 0,
      margin: 0,
      minWidth: 0,
      outline: 'none',
      padding: 0,
    });
  });

  it('preserves explicit field chrome from shared styles', () => {
    expect(normalizeWebTextInputStyle({
      backgroundColor: '#fffaf0',
      borderWidth: 1,
      padding: 12,
    }, true)).toMatchObject({
      backgroundColor: '#fffaf0',
      borderWidth: 1,
      padding: 12,
    });
  });

  it('converts React Native numeric line height to CSS pixels', () => {
    expect(normalizeWebTextInputStyle({ lineHeight: 26 }, true)).toMatchObject({
      height: 150,
      lineHeight: '26px',
      resize: 'none',
      userSelect: 'text',
    });
  });

  it('does not force multiline sizing onto a single-line input', () => {
    expect(normalizeWebTextInputStyle({ height: 44, lineHeight: '20px' }, false)).toMatchObject({
      height: 44,
      lineHeight: '20px',
    });
  });
});
