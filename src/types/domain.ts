export type VerseKey = `${number}:${number}`;

export interface Surah {
  number: number;
  nameArabic: string;
  nameTransliterated: string;
  ayahCount: number;
}

export interface QuranAyah {
  surahNumber: number;
  ayahNumber: number;
  verseKey: VerseKey;
  textUthmani: string;
}

export interface TranslationVerse {
  key: VerseKey;
  text: string;
}

export interface TranslationManifest {
  format: 'quran-translation';
  version: 1;
  id: string;
  title: string;
  language: string;
  translator: string;
  source: { name: string; url: string | null };
  license: { name: string; url: string | null };
  verses: TranslationVerse[];
}

export interface InstalledTranslation {
  id: string;
  title: string;
  language: string;
  translator: string;
  sourceName: string;
  sourceUrl: string | null;
  licenseName: string;
  licenseUrl: string | null;
  contentSha256: string;
  importedAt: number;
  updatedAt: number;
  verseCount: number;
}

export type HighlightColor = 'amber' | 'sage' | 'sky' | 'rose';

export interface VerseAnnotation {
  translationId: string;
  surahNumber: number;
  ayahNumber: number;
  noteText: string | null;
  highlightColor: HighlightColor | null;
  createdAt: number;
  updatedAt: number;
}

export interface ReaderAyah extends QuranAyah {
  translationText: string | null;
  annotation: VerseAnnotation | null;
}

export interface AnnotatedAyah extends VerseAnnotation {
  verseKey: VerseKey;
  translationTitle: string;
  translationText: string;
  surahName: string;
}
