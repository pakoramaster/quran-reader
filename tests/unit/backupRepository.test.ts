import {
  createBackupArchive,
  inspectBackupArchive,
  restoreBackupArchive,
} from '@/features/backup/data/backupRepository';
import type { SQLiteDatabase } from 'expo-sqlite';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import {
  readDownloadedRecitationFile,
  writeDownloadedRecitationFile,
} from '@/features/recitation/data/recitationFileStore';

jest.mock('@/features/recitation/data/recitationFileStore', () => ({
  readDownloadedRecitationFile: jest.fn(),
  writeDownloadedRecitationFile: jest.fn(),
}));
jest.mock('@/platform/database/runAtomicWrite', () => ({
  runAtomicWrite: jest.fn(async (db, work) => work(db)),
}));

const readAudio = jest.mocked(readDownloadedRecitationFile);
const writeAudio = jest.mocked(writeDownloadedRecitationFile);

class RestoreTestDatabase {
  readonly sqlite = new DatabaseSync(':memory:');

  constructor() {
    this.sqlite.exec(`
      CREATE TABLE translations (
        id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, language TEXT NOT NULL,
        translator TEXT NOT NULL, source_name TEXT NOT NULL, source_url TEXT,
        license_name TEXT NOT NULL, license_url TEXT, format_version INTEGER NOT NULL,
        content_sha256 TEXT NOT NULL, imported_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE translation_verses (
        translation_id TEXT NOT NULL, surah_number INTEGER NOT NULL, ayah_number INTEGER NOT NULL,
        verse_key TEXT NOT NULL, original_text TEXT NOT NULL,
        PRIMARY KEY (translation_id, surah_number, ayah_number), UNIQUE (translation_id, verse_key)
      ) STRICT;
      CREATE TABLE annotations (
        translation_id TEXT NOT NULL, surah_number INTEGER NOT NULL, ayah_number INTEGER NOT NULL,
        note_text TEXT, highlight_color TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        PRIMARY KEY (translation_id, surah_number, ayah_number)
      ) STRICT;
      CREATE UNIQUE INDEX annotations_verse ON annotations(surah_number, ayah_number);
      CREATE TABLE app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL) STRICT;
      CREATE TABLE recitation_downloads (
        reciter_id TEXT NOT NULL, surah_number INTEGER NOT NULL, verse_count INTEGER NOT NULL,
        byte_count INTEGER NOT NULL, downloaded_at INTEGER NOT NULL,
        PRIMARY KEY (reciter_id, surah_number)
      ) STRICT;
    `);
  }

  async runAsync(source: string, ...params: SQLInputValue[]): Promise<void> {
    this.sqlite.prepare(source).run(...params);
  }
}

function sourceDatabase() {
  const getAllAsync = jest.fn(async (sql: string, translationId?: string) => {
    if (sql.startsWith('SELECT * FROM translations')) return [{
      id: 'asad', title: 'The Message', language: 'en', translator: 'Muhammad Asad',
      source_name: 'Local import', source_url: null, license_name: 'User supplied', license_url: null,
      content_sha256: 'abc123', imported_at: 10, updated_at: 20,
    }];
    if (sql.includes('FROM translation_verses')) {
      expect(translationId).toBe('asad');
      return [{ verse_key: '1:1', original_text: 'In the name of God' }];
    }
    if (sql.startsWith('SELECT * FROM annotations')) return [{
      translation_id: 'asad', surah_number: 1, ayah_number: 1, note_text: 'A reflection',
      highlight_color: 'amber', created_at: 30, updated_at: 40,
    }];
    if (sql.includes('FROM app_settings')) return [
      { key: 'reading_font_size', value: 'large' },
      { key: 'tts_speed', value: 'fast' },
      { key: 'tts_voice_profile', value: 'calm' },
    ];
    if (sql.startsWith('SELECT * FROM recitation_downloads')) return [{
      reciter_id: 'husary', surah_number: 1, verse_count: 2, byte_count: 5, downloaded_at: 50,
    }];
    throw new Error(`Unexpected query: ${sql}`);
  });
  return { getAllAsync } as never;
}

describe('backup and restore repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readAudio.mockImplementation(async (_reciter, verseKey) => (
      verseKey === '1:1' ? new Uint8Array([1, 2]) : new Uint8Array([3, 4, 5])
    ));
  });

  it('archives translations, notes, preferences, and every downloaded Ayah MP3', async () => {
    const archive = await createBackupArchive(sourceDatabase());
    const { backup, files, summary } = inspectBackupArchive(archive.bytes);

    expect(summary).toMatchObject({ translationCount: 1, annotationCount: 1, downloadedSurahCount: 1, audioFileCount: 2 });
    expect(backup.translations[0]?.manifest.verses).toEqual([{ key: '1:1', text: 'In the name of God' }]);
    expect(backup.annotations[0]?.noteText).toBe('A reflection');
    expect(backup.settings).toEqual(expect.arrayContaining([
      { key: 'reading_font_size', value: 'large' },
      { key: 'tts_speed', value: 'fast' },
      { key: 'tts_voice_profile', value: 'calm' },
    ]));
    expect(Array.from(files['recitations/husary/1/1.mp3'] ?? [])).toEqual([1, 2]);
    expect(Array.from(files['recitations/husary/1/2.mp3'] ?? [])).toEqual([3, 4, 5]);
  });

  it('merges restored items without deleting other data or changing preferences', async () => {
    const archive = await createBackupArchive(sourceDatabase());
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const execAsync = jest.fn().mockResolvedValue(undefined);
    const getAllAsync = jest.fn();
    await restoreBackupArchive({ execAsync, getAllAsync, runAsync } as never, archive.bytes);

    expect(writeAudio).toHaveBeenCalledTimes(2);
    expect(writeAudio).toHaveBeenCalledWith('husary', '1:1', new Uint8Array([1, 2]));
    expect(writeAudio).toHaveBeenCalledWith('husary', '1:2', new Uint8Array([3, 4, 5]));
    expect(execAsync).not.toHaveBeenCalled();
    expect(getAllAsync).not.toHaveBeenCalled();
    expect(runAsync.mock.calls.some(([sql]) => String(sql).includes('ON CONFLICT(id) DO UPDATE'))).toBe(true);
    expect(runAsync).toHaveBeenCalledWith('DELETE FROM translation_verses WHERE translation_id = ?', 'asad');
    expect(runAsync.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO translation_verses'))).toBe(true);
    expect(runAsync.mock.calls.some(([sql]) => String(sql).includes('ON CONFLICT(surah_number, ayah_number) DO UPDATE'))).toBe(true);
    expect(runAsync.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO app_settings'))).toBe(false);
    expect(runAsync.mock.calls.some(([sql]) => String(sql).includes('ON CONFLICT(reciter_id, surah_number) DO UPDATE'))).toBe(true);
  });

  it('preserves unrelated records and current setting values in SQLite', async () => {
    const archive = await createBackupArchive(sourceDatabase());
    const database = new RestoreTestDatabase();
    database.sqlite.exec(`
      INSERT INTO translations VALUES ('pickthall', 'Pickthall', 'en', 'Pickthall', 'Local', NULL, 'User supplied', NULL, 1, 'old', 1, 1);
      INSERT INTO translation_verses VALUES ('pickthall', 2, 1, '2:1', 'Alif Lam Mim');
      INSERT INTO annotations VALUES ('pickthall', 2, 1, 'Keep this note', 'sky', 1, 1);
      INSERT INTO app_settings VALUES ('tts_speed', 'slow'), ('tts_voice_profile', 'bright');
      INSERT INTO recitation_downloads VALUES ('abdul-basit', 2, 1, 99, 1);
    `);

    try {
      await restoreBackupArchive(database as unknown as SQLiteDatabase, archive.bytes);

      expect(database.sqlite.prepare('SELECT id FROM translations ORDER BY id').all()).toEqual([
        expect.objectContaining({ id: 'asad' }),
        expect.objectContaining({ id: 'pickthall' }),
      ]);
      expect(database.sqlite.prepare("SELECT note_text FROM annotations WHERE surah_number = 2 AND ayah_number = 1").get())
        .toEqual(expect.objectContaining({ note_text: 'Keep this note' }));
      expect(database.sqlite.prepare('SELECT key, value FROM app_settings ORDER BY key').all()).toEqual([
        expect.objectContaining({ key: 'tts_speed', value: 'slow' }),
        expect.objectContaining({ key: 'tts_voice_profile', value: 'bright' }),
      ]);
      expect(database.sqlite.prepare("SELECT byte_count FROM recitation_downloads WHERE reciter_id = 'abdul-basit' AND surah_number = 2").get())
        .toEqual(expect.objectContaining({ byte_count: 99 }));
    } finally {
      database.sqlite.close();
    }
  });
});
