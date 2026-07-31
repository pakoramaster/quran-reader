import type { SQLiteDatabase } from 'expo-sqlite';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import {
  deleteTranslation,
  getActiveTranslationId,
} from '@/features/translations/data/translationRepository';

class TranslationTestDatabase {
  readonly sqlite = new DatabaseSync(':memory:');

  constructor() {
    this.sqlite.exec(`
      PRAGMA foreign_keys = OFF;

      CREATE TABLE translations (
        id TEXT PRIMARY KEY NOT NULL,
        imported_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE translation_verses (
        translation_id TEXT NOT NULL,
        verse_key TEXT NOT NULL
      ) STRICT;

      CREATE TABLE annotations (
        translation_id TEXT NOT NULL,
        verse_key TEXT NOT NULL,
        note_text TEXT
      ) STRICT;

      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      ) STRICT;
    `);
  }

  async getFirstAsync<T>(source: string, ...params: SQLInputValue[]): Promise<T | null> {
    return (this.sqlite.prepare(source).get(...params) as T | undefined) ?? null;
  }

  async runAsync(source: string, ...params: SQLInputValue[]): Promise<void> {
    this.sqlite.prepare(source).run(...params);
  }

  async withExclusiveTransactionAsync(
    task: (transaction: SQLiteDatabase) => Promise<void>,
  ): Promise<void> {
    this.sqlite.exec('BEGIN');
    try {
      await task(this as unknown as SQLiteDatabase);
      this.sqlite.exec('COMMIT');
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

function seedTranslation(
  database: TranslationTestDatabase,
  id: string,
  importedAt: number,
  verseKey: string,
): void {
  database.sqlite.prepare(
    'INSERT INTO translations (id, imported_at) VALUES (?, ?)',
  ).run(id, importedAt);
  database.sqlite.prepare(
    'INSERT INTO translation_verses (translation_id, verse_key) VALUES (?, ?)',
  ).run(id, verseKey);
  database.sqlite.prepare(
    'INSERT INTO annotations (translation_id, verse_key, note_text) VALUES (?, ?, ?)',
  ).run(id, verseKey, `Note for ${id}`);
}

function setActiveTranslation(database: TranslationTestDatabase, id: string): void {
  database.sqlite.prepare(
    "INSERT INTO app_settings (key, value) VALUES ('active_translation_id', ?)",
  ).run(id);
}

function translationIds(database: TranslationTestDatabase): string[] {
  return database.sqlite.prepare('SELECT id FROM translations ORDER BY id').all()
    .map((row) => String(row.id));
}

function childOwners(database: TranslationTestDatabase, table: 'annotations' | 'translation_verses'): string[] {
  return database.sqlite.prepare(`SELECT translation_id FROM ${table} ORDER BY translation_id`).all()
    .map((row) => String(row.translation_id));
}

describe('translationRepository deletion', () => {
  let database: TranslationTestDatabase;
  let expoDatabase: SQLiteDatabase;

  beforeEach(() => {
    database = new TranslationTestDatabase();
    expoDatabase = database as unknown as SQLiteDatabase;
  });

  afterEach(() => database.sqlite.close());

  it('explicitly removes target children while preserving an inactive translation and its children', async () => {
    seedTranslation(database, 'translation-a', 100, '1:1');
    seedTranslation(database, 'translation-b', 200, '1:2');
    setActiveTranslation(database, 'translation-b');

    expect(database.sqlite.prepare('PRAGMA foreign_keys').get()).toEqual(
      expect.objectContaining({ foreign_keys: 0 }),
    );

    await expect(deleteTranslation(expoDatabase, 'translation-a')).resolves.toBe(true);

    expect(translationIds(database)).toEqual(['translation-b']);
    expect(childOwners(database, 'translation_verses')).toEqual(['translation-b']);
    expect(childOwners(database, 'annotations')).toEqual(['translation-b']);
    await expect(getActiveTranslationId(expoDatabase)).resolves.toBe('translation-b');
  });

  it('selects the earliest remaining translation after deleting the active translation', async () => {
    seedTranslation(database, 'translation-a', 100, '1:1');
    seedTranslation(database, 'translation-b', 300, '1:2');
    seedTranslation(database, 'translation-c', 200, '1:3');
    setActiveTranslation(database, 'translation-a');

    await expect(deleteTranslation(expoDatabase, 'translation-a')).resolves.toBe(true);

    await expect(getActiveTranslationId(expoDatabase)).resolves.toBe('translation-c');
    expect(database.sqlite.prepare(
      "SELECT value FROM app_settings WHERE key = 'active_translation_id'",
    ).get()).toEqual(expect.objectContaining({ value: 'translation-c' }));
  });

  it('clears the active setting after deleting the last translation', async () => {
    seedTranslation(database, 'translation-a', 100, '1:1');
    setActiveTranslation(database, 'translation-a');

    await expect(deleteTranslation(expoDatabase, 'translation-a')).resolves.toBe(true);

    expect(translationIds(database)).toEqual([]);
    expect(childOwners(database, 'translation_verses')).toEqual([]);
    expect(childOwners(database, 'annotations')).toEqual([]);
    expect(database.sqlite.prepare(
      "SELECT value FROM app_settings WHERE key = 'active_translation_id'",
    ).get()).toBeUndefined();
    await expect(getActiveTranslationId(expoDatabase)).resolves.toBeNull();
  });

  it('returns false and leaves all data unchanged when the translation does not exist', async () => {
    seedTranslation(database, 'translation-a', 100, '1:1');
    setActiveTranslation(database, 'translation-a');

    await expect(deleteTranslation(expoDatabase, 'missing')).resolves.toBe(false);

    expect(translationIds(database)).toEqual(['translation-a']);
    expect(childOwners(database, 'translation_verses')).toEqual(['translation-a']);
    expect(childOwners(database, 'annotations')).toEqual(['translation-a']);
    await expect(getActiveTranslationId(expoDatabase)).resolves.toBe('translation-a');
  });

  it('rolls back active selection and child cleanup when deleting the parent fails', async () => {
    seedTranslation(database, 'translation-a', 100, '1:1');
    seedTranslation(database, 'translation-b', 200, '1:2');
    setActiveTranslation(database, 'translation-a');
    database.sqlite.exec(`
      CREATE TRIGGER block_translation_delete
      BEFORE DELETE ON translations
      WHEN OLD.id = 'translation-a'
      BEGIN
        SELECT RAISE(ABORT, 'blocked translation deletion');
      END;
    `);

    await expect(deleteTranslation(expoDatabase, 'translation-a'))
      .rejects.toThrow('blocked translation deletion');

    expect(translationIds(database)).toEqual(['translation-a', 'translation-b']);
    expect(childOwners(database, 'translation_verses')).toEqual([
      'translation-a',
      'translation-b',
    ]);
    expect(childOwners(database, 'annotations')).toEqual([
      'translation-a',
      'translation-b',
    ]);
    await expect(getActiveTranslationId(expoDatabase)).resolves.toBe('translation-a');
  });
});
