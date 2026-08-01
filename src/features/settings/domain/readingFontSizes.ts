export type ReadingFontSizeId = 'small' | 'medium' | 'large' | 'extra-large';

export interface ReadingFontSize {
  id: ReadingFontSizeId;
  label: string;
  description: string;
  scale: number;
}

export const READING_FONT_SIZES: readonly ReadingFontSize[] = [
  { id: 'small', label: 'Small', description: 'More Ayahs on screen', scale: 0.86 },
  { id: 'medium', label: 'Medium', description: 'Balanced and comfortable', scale: 1 },
  { id: 'large', label: 'Large', description: 'Larger reading text', scale: 1.2 },
  { id: 'extra-large', label: 'Extra large', description: 'Maximum readability', scale: 1.4 },
] as const;

export const DEFAULT_READING_FONT_SIZE_ID: ReadingFontSizeId = 'medium';

export function isReadingFontSizeId(value: string | null | undefined): value is ReadingFontSizeId {
  return READING_FONT_SIZES.some((option) => option.id === value);
}

export function getReadingFontSize(value: string | null | undefined): ReadingFontSize {
  return READING_FONT_SIZES.find((option) => option.id === value) ?? READING_FONT_SIZES[1]!;
}
