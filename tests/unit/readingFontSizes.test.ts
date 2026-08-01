import {
  DEFAULT_READING_FONT_SIZE_ID,
  getReadingFontSize,
  isReadingFontSizeId,
  READING_FONT_SIZES,
} from '@/features/settings/domain/readingFontSizes';

describe('reading font sizes', () => {
  it('provides four ordered, persistent choices', () => {
    expect(READING_FONT_SIZES.map((option) => option.id)).toEqual([
      'small',
      'medium',
      'large',
      'extra-large',
    ]);
    expect(READING_FONT_SIZES.map((option) => option.scale)).toEqual([0.86, 1, 1.2, 1.4]);
  });

  it('validates stored values and falls back to medium', () => {
    expect(isReadingFontSizeId('large')).toBe(true);
    expect(isReadingFontSizeId('huge')).toBe(false);
    expect(getReadingFontSize('huge').id).toBe(DEFAULT_READING_FONT_SIZE_ID);
  });
});
