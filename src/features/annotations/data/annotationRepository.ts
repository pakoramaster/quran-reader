import type { SQLiteDatabase } from 'expo-sqlite';

import type { AnnotatedAyah, HighlightColor, VerseAnnotation } from '@/types/domain';

interface AnnotationRow {
  translation_id: string;
  surah_number: number;
  ayah_number: number;
  note_text: string | null;
  highlight_color: HighlightColor | null;
  created_at: number;
  updated_at: number;
}

function mapAnnotation(row: AnnotationRow): VerseAnnotation {
  return {
    translationId: row.translation_id,
    surahNumber: row.surah_number,
    ayahNumber: row.ayah_number,
    noteText: row.note_text,
    highlightColor: row.highlight_color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAnnotationsForSurah(
  db: SQLiteDatabase,
  surahNumber: number,
): Promise<VerseAnnotation[]> {
  const rows = await db.getAllAsync<AnnotationRow>(
    `SELECT * FROM annotations WHERE surah_number = ? ORDER BY ayah_number`,
    surahNumber,
  );
  return rows.map(mapAnnotation);
}

export async function saveAnnotation(
  db: SQLiteDatabase,
  input: {
    translationId: string;
    surahNumber: number;
    ayahNumber: number;
    noteText: string | null;
    highlightColor: HighlightColor | null;
  },
): Promise<void> {
  const note = input.noteText?.trim() || null;
  if (!note && !input.highlightColor) {
    await db.runAsync(
      'DELETE FROM annotations WHERE surah_number = ? AND ayah_number = ?',
      input.surahNumber,
      input.ayahNumber,
    );
    return;
  }
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO annotations (
      translation_id, surah_number, ayah_number, note_text, highlight_color, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(surah_number, ayah_number) DO UPDATE SET
      note_text = excluded.note_text,
      highlight_color = excluded.highlight_color,
      updated_at = excluded.updated_at`,
    input.translationId,
    input.surahNumber,
    input.ayahNumber,
    note,
    input.highlightColor,
    now,
    now,
  );
}

export async function deleteAnnotation(
  db: SQLiteDatabase,
  surahNumber: number,
  ayahNumber: number,
): Promise<void> {
  await db.runAsync(
    'DELETE FROM annotations WHERE surah_number = ? AND ayah_number = ?',
    surahNumber,
    ayahNumber,
  );
}

export async function listAnnotatedAyahs(
  db: SQLiteDatabase,
  query: string,
  translationId: string | null,
  color: HighlightColor | null,
): Promise<AnnotatedAyah[]> {
  const filters: string[] = [];
  const params: (string | number)[] = [];
  if (translationId) {
    filters.push('a.translation_id = ?');
    params.push(translationId);
  }
  if (color) {
    filters.push('a.highlight_color = ?');
    params.push(color);
  }
  if (query.trim()) {
    filters.push('(a.note_text LIKE ? OR v.original_text LIKE ?)');
    params.push(`%${query.trim()}%`, `%${query.trim()}%`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await db.getAllAsync<AnnotationRow & {
    verse_key: AnnotatedAyah['verseKey'];
    translation_title: string;
    translation_text: string;
  }>(
    `SELECT a.*, v.verse_key, v.original_text AS translation_text, t.title AS translation_title
     FROM annotations a
     JOIN translation_verses v ON v.translation_id = a.translation_id
       AND v.surah_number = a.surah_number AND v.ayah_number = a.ayah_number
     JOIN translations t ON t.id = a.translation_id
     ${where}
     ORDER BY a.updated_at DESC`,
    ...params,
  );
  return rows.map((row) => ({
    ...mapAnnotation(row),
    verseKey: row.verse_key,
    translationTitle: row.translation_title,
    translationText: row.translation_text,
    surahName: `Surah ${row.surah_number}`,
  }));
}
