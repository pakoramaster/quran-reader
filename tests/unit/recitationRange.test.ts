import { filterRecitationRange, resolveResumeVerseKey } from '@/features/recitation/domain/recitationRange';
import type { VerseKey } from '@/types/domain';

const verse = (surahNumber: number, ayahNumber: number) => ({
  key: `${surahNumber}:${ayahNumber}` as VerseKey,
  surahNumber,
  ayahNumber,
});

describe('recitation range', () => {
  const verses = [verse(1, 1), verse(1, 2), verse(1, 3), verse(2, 1), verse(2, 2), verse(2, 3)];

  it('includes the selected starting and ending Ayahs across Surahs', () => {
    expect(filterRecitationRange(verses, {
      startSurah: 1,
      startAyah: 2,
      endSurah: 2,
      endAyah: 2,
    }).map((item) => item.key)).toEqual(['1:2', '1:3', '2:1', '2:2']);
  });

  it('supports a partial range within one Surah', () => {
    expect(filterRecitationRange(verses, {
      startSurah: 2,
      startAyah: 2,
      endSurah: 2,
      endAyah: 3,
    }).map((item) => item.key)).toEqual(['2:2', '2:3']);
  });

  it('resumes at a stored verse when it remains in range', () => {
    expect(resolveResumeVerseKey(verses, '2:2')).toBe('2:2');
  });

  it('falls back to the first range verse for a stale playhead', () => {
    expect(resolveResumeVerseKey(verses, '3:1')).toBe('1:1');
  });
});
