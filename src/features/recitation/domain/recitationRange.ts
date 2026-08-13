import type { VerseKey } from '@/types/domain';

export interface VersePosition {
  key: VerseKey;
  surahNumber: number;
  ayahNumber: number;
}

export interface RecitationRange {
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
}

export function isVerseInRecitationRange(verse: VersePosition, range: RecitationRange): boolean {
  const afterStart = verse.surahNumber > range.startSurah
    || (verse.surahNumber === range.startSurah && verse.ayahNumber >= range.startAyah);
  const beforeEnd = verse.surahNumber < range.endSurah
    || (verse.surahNumber === range.endSurah && verse.ayahNumber <= range.endAyah);
  return afterStart && beforeEnd;
}

export function filterRecitationRange<T extends VersePosition>(verses: T[], range: RecitationRange): T[] {
  return verses.filter((verse) => isVerseInRecitationRange(verse, range));
}

export function resolveResumeVerseKey(verses: VersePosition[], storedKey: string | null): VerseKey | null {
  if (storedKey) {
    const storedVerse = verses.find((verse) => verse.key === storedKey);
    if (storedVerse) return storedVerse.key;
  }
  return verses[0]?.key ?? null;
}
