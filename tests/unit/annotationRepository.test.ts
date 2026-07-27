import type { SQLiteDatabase } from 'expo-sqlite';

import {
  deleteAnnotation,
  listAnnotationsForSurah,
  saveAnnotation,
} from '@/features/annotations/data/annotationRepository';

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('annotationRepository', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lists every annotation in a surah without filtering by translation', async () => {
    const getAllAsync = jest.fn().mockResolvedValue([
      {
        translation_id: 'translation-a',
        surah_number: 2,
        ayah_number: 1,
        note_text: 'First note',
        highlight_color: null,
        created_at: 10,
        updated_at: 11,
      },
      {
        translation_id: 'translation-b',
        surah_number: 2,
        ayah_number: 2,
        note_text: null,
        highlight_color: 'sage',
        created_at: 12,
        updated_at: 13,
      },
    ]);
    const db = { getAllAsync } as unknown as SQLiteDatabase;

    const annotations = await listAnnotationsForSurah(db, 2);

    expect(getAllAsync).toHaveBeenCalledTimes(1);
    const [sql, ...params] = getAllAsync.mock.calls[0] as [string, ...unknown[]];
    expect(normalizeSql(sql)).toBe(
      'SELECT * FROM annotations WHERE surah_number = ? ORDER BY ayah_number',
    );
    expect(sql).not.toContain('translation_id = ?');
    expect(params).toEqual([2]);
    expect(annotations).toEqual([
      {
        translationId: 'translation-a',
        surahNumber: 2,
        ayahNumber: 1,
        noteText: 'First note',
        highlightColor: null,
        createdAt: 10,
        updatedAt: 11,
      },
      {
        translationId: 'translation-b',
        surahNumber: 2,
        ayahNumber: 2,
        noteText: null,
        highlightColor: 'sage',
        createdAt: 12,
        updatedAt: 13,
      },
    ]);
  });

  it('deletes an annotation globally by verse', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const db = { runAsync } as unknown as SQLiteDatabase;

    await deleteAnnotation(db, 18, 42);

    expect(runAsync).toHaveBeenCalledWith(
      'DELETE FROM annotations WHERE surah_number = ? AND ayah_number = ?',
      18,
      42,
    );
  });

  it('deletes the verse annotation when saving an empty note without a color', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const db = { runAsync } as unknown as SQLiteDatabase;

    await saveAnnotation(db, {
      translationId: 'translation-a',
      surahNumber: 18,
      ayahNumber: 42,
      noteText: '   ',
      highlightColor: null,
    });

    expect(runAsync).toHaveBeenCalledTimes(1);
    expect(runAsync).toHaveBeenCalledWith(
      'DELETE FROM annotations WHERE surah_number = ? AND ayah_number = ?',
      18,
      42,
    );
  });

  it('upserts on the global verse key with normalized values and timestamps', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(123456789);
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const db = { runAsync } as unknown as SQLiteDatabase;

    await saveAnnotation(db, {
      translationId: 'translation-b',
      surahNumber: 36,
      ayahNumber: 12,
      noteText: '  Remember this  ',
      highlightColor: 'sky',
    });

    expect(runAsync).toHaveBeenCalledTimes(1);
    const [sql, ...params] = runAsync.mock.calls[0] as [string, ...unknown[]];
    expect(normalizeSql(sql)).toContain(
      'ON CONFLICT(surah_number, ayah_number) DO UPDATE SET',
    );
    expect(normalizeSql(sql)).toContain(
      'note_text = excluded.note_text, highlight_color = excluded.highlight_color, updated_at = excluded.updated_at',
    );
    expect(normalizeSql(sql)).not.toContain('translation_id = excluded.translation_id');
    expect(sql).not.toContain('ON CONFLICT(translation_id');
    expect(params).toEqual([
      'translation-b',
      36,
      12,
      'Remember this',
      'sky',
      123456789,
      123456789,
    ]);
  });
});
