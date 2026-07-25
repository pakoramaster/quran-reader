import { normalizeWebTextInputStyle } from '@/platform/ui/webTextInputStyle';

describe('normalizeWebTextInputStyle', () => {
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
