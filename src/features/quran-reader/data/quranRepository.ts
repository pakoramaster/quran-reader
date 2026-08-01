import type { SQLiteDatabase } from 'expo-sqlite';

import type { QuranAyah, Surah, VerseKey } from '@/types/domain';

interface SurahRow {
  number: number;
  name_arabic: string;
  name_transliterated: string;
  ayah_count: number;
}

interface AyahRow {
  surah_number: number;
  ayah_number: number;
  verse_key: VerseKey;
  text_uthmani: string;
}

export async function listSurahs(db: SQLiteDatabase): Promise<Surah[]> {
  const rows = await db.getAllAsync<SurahRow>('SELECT * FROM surahs ORDER BY number');
  return rows.map((row) => ({
    number: row.number,
    nameArabic: row.name_arabic,
    nameTransliterated: row.name_transliterated,
    ayahCount: row.ayah_count,
  }));
}

export async function getSurah(db: SQLiteDatabase, number: number): Promise<Surah | null> {
  const row = await db.getFirstAsync<SurahRow>('SELECT * FROM surahs WHERE number = ?', number);
  return row
    ? {
        number: row.number,
        nameArabic: row.name_arabic,
        nameTransliterated: row.name_transliterated,
        ayahCount: row.ayah_count,
      }
    : null;
}

export async function listAyahs(db: SQLiteDatabase, surahNumber: number): Promise<QuranAyah[]> {
  const rows = await db.getAllAsync<AyahRow>(
    'SELECT * FROM ayahs WHERE surah_number = ? ORDER BY ayah_number',
    surahNumber,
  );
  return rows.map((row) => ({
    surahNumber: row.surah_number,
    ayahNumber: row.ayah_number,
    verseKey: row.verse_key,
    textUthmani: row.text_uthmani,
  }));
}

export async function listAyahsInRange(
  db: SQLiteDatabase,
  startSurah: number,
  endSurah: number,
): Promise<QuranAyah[]> {
  const rows = await db.getAllAsync<AyahRow>(
    `SELECT * FROM ayahs
     WHERE surah_number BETWEEN ? AND ?
     ORDER BY surah_number, ayah_number`,
    startSurah,
    endSurah,
  );
  return rows.map((row) => ({
    surahNumber: row.surah_number,
    ayahNumber: row.ayah_number,
    verseKey: row.verse_key,
    textUthmani: row.text_uthmani,
  }));
}

export async function getAyah(
  db: SQLiteDatabase,
  surahNumber: number,
  ayahNumber: number,
): Promise<QuranAyah | null> {
  const row = await db.getFirstAsync<AyahRow>(
    'SELECT * FROM ayahs WHERE surah_number = ? AND ayah_number = ?',
    surahNumber,
    ayahNumber,
  );
  return row
    ? {
        surahNumber: row.surah_number,
        ayahNumber: row.ayah_number,
        verseKey: row.verse_key,
        textUthmani: row.text_uthmani,
      }
    : null;
}

export async function listCanonicalVerseKeys(db: SQLiteDatabase): Promise<VerseKey[]> {
  const rows = await db.getAllAsync<{ verse_key: VerseKey }>('SELECT verse_key FROM ayahs');
  return rows.map((row) => row.verse_key);
}

export async function getQuranMetadata(db: SQLiteDatabase): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM quran_metadata');
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}
