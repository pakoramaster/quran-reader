import type { SQLiteDatabase } from 'expo-sqlite';

const VERSION = 1;

export async function migrateUserDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;
  if (currentVersion >= VERSION) return;

  await db.withTransactionAsync(async () => {
    if (currentVersion < 1) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS translations (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          language TEXT NOT NULL,
          translator TEXT NOT NULL,
          source_name TEXT NOT NULL,
          source_url TEXT,
          license_name TEXT NOT NULL,
          license_url TEXT,
          format_version INTEGER NOT NULL CHECK (format_version = 1),
          content_sha256 TEXT NOT NULL,
          imported_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        ) STRICT;

        CREATE TABLE IF NOT EXISTS translation_verses (
          translation_id TEXT NOT NULL,
          surah_number INTEGER NOT NULL CHECK (surah_number BETWEEN 1 AND 114),
          ayah_number INTEGER NOT NULL CHECK (ayah_number > 0),
          verse_key TEXT NOT NULL,
          original_text TEXT NOT NULL,
          PRIMARY KEY (translation_id, surah_number, ayah_number),
          UNIQUE (translation_id, verse_key),
          FOREIGN KEY (translation_id) REFERENCES translations(id) ON DELETE CASCADE
        ) STRICT;

        CREATE TABLE IF NOT EXISTS annotations (
          translation_id TEXT NOT NULL,
          surah_number INTEGER NOT NULL CHECK (surah_number BETWEEN 1 AND 114),
          ayah_number INTEGER NOT NULL CHECK (ayah_number > 0),
          note_text TEXT,
          highlight_color TEXT CHECK (highlight_color IN ('amber', 'sage', 'sky', 'rose')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (translation_id, surah_number, ayah_number),
          FOREIGN KEY (translation_id) REFERENCES translations(id) ON DELETE CASCADE,
          CHECK (note_text IS NOT NULL OR highlight_color IS NOT NULL)
        ) STRICT;

        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        ) STRICT;

        CREATE INDEX IF NOT EXISTS translation_verses_surah
          ON translation_verses(translation_id, surah_number, ayah_number);
        CREATE INDEX IF NOT EXISTS annotations_updated
          ON annotations(updated_at DESC);
        PRAGMA user_version = 1;
      `);
    }
  });
}
