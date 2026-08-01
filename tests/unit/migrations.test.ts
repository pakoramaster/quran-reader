import type { SQLiteDatabase } from 'expo-sqlite';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { migrateUserDatabase } from '@/data/databases/migrations';
import { saveAnnotation } from '@/features/annotations/data/annotationRepository';

class MigrationTestDatabase {
  readonly sqlite = new DatabaseSync(':memory:');

  async execAsync(source: string): Promise<void> {
    this.sqlite.exec(source);
  }

  async getFirstAsync<T>(source: string, ...params: SQLInputValue[]): Promise<T | null> {
    return (this.sqlite.prepare(source).get(...params) as T | undefined) ?? null;
  }

  async runAsync(source: string, ...params: SQLInputValue[]): Promise<void> {
    this.sqlite.prepare(source).run(...params);
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.sqlite.exec('BEGIN');
    try {
      await task();
      this.sqlite.exec('COMMIT');
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

describe('user database migrations', () => {
  let database: MigrationTestDatabase;

  beforeEach(() => {
    database = new MigrationTestDatabase();
    database.sqlite.exec(`
      CREATE TABLE annotations (
        translation_id TEXT NOT NULL,
        surah_number INTEGER NOT NULL,
        ayah_number INTEGER NOT NULL,
        note_text TEXT,
        highlight_color TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (translation_id, surah_number, ayah_number)
      ) STRICT;
      PRAGMA user_version = 2;
    `);
  });

  afterEach(() => database.sqlite.close());

  it('keeps one newest annotation per verse without dropping distinct note text', async () => {
    const insert = database.sqlite.prepare(`
      INSERT INTO annotations
        (translation_id, surah_number, ayah_number, note_text, highlight_color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run('oldest-translation', 2, 255, 'Earlier note', 'amber', 5, 50);
    insert.run('older-translation', 2, 255, 'Newest note', 'amber', 10, 100);
    insert.run('duplicate-translation', 2, 255, 'Newest note', 'rose', 15, 150);
    insert.run('newer-translation', 2, 255, null, 'sky', 20, 200);
    insert.run('only-translation', 1, 1, 'Unchanged', null, 30, 300);

    await migrateUserDatabase(database as unknown as SQLiteDatabase);

    const rows = database.sqlite.prepare(`
      SELECT translation_id, surah_number, ayah_number, note_text, highlight_color
      FROM annotations
      ORDER BY surah_number, ayah_number
    `).all();
    expect(rows).toEqual([
      expect.objectContaining({
        translation_id: 'only-translation',
        surah_number: 1,
        ayah_number: 1,
        note_text: 'Unchanged',
        highlight_color: null,
      }),
      expect.objectContaining({
        translation_id: 'newer-translation',
        surah_number: 2,
        ayah_number: 255,
        note_text: 'Newest note\n\n---\n\nEarlier note',
        highlight_color: 'sky',
      }),
    ]);
    expect(database.sqlite.prepare('PRAGMA user_version').get()).toEqual(
        expect.objectContaining({ user_version: 4 }),
    );
    expect(() => insert.run('third-translation', 2, 255, 'Duplicate', null, 40, 400))
      .toThrow(/UNIQUE constraint failed/);

    await saveAnnotation(database as unknown as SQLiteDatabase, {
      translationId: 'third-translation',
      surahNumber: 2,
      ayahNumber: 255,
      noteText: 'Edited once',
      highlightColor: null,
    });
    expect(database.sqlite.prepare(`
      SELECT translation_id, note_text, highlight_color, COUNT(*) AS row_count
      FROM annotations
      WHERE surah_number = 2 AND ayah_number = 255
    `).get()).toEqual(expect.objectContaining({
      translation_id: 'newer-translation',
      note_text: 'Edited once',
      highlight_color: null,
      row_count: 1,
    }));
  });
});
