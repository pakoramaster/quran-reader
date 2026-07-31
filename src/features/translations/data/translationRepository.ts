import type { SQLiteDatabase } from 'expo-sqlite';

import { runAtomicWrite } from '@/platform/database/runAtomicWrite';
import type { InstalledTranslation, TranslationManifest, TranslationVerse } from '@/types/domain';
import { normalizeTranslationText } from '../domain/translationText';

interface TranslationRow {
  id: string;
  title: string;
  language: string;
  translator: string;
  source_name: string;
  source_url: string | null;
  license_name: string;
  license_url: string | null;
  content_sha256: string;
  imported_at: number;
  updated_at: number;
  verse_count: number;
}

function mapTranslation(row: TranslationRow): InstalledTranslation {
  return {
    id: row.id,
    title: row.title,
    language: row.language,
    translator: row.translator,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    licenseName: row.license_name,
    licenseUrl: row.license_url,
    contentSha256: row.content_sha256,
    importedAt: row.imported_at,
    updatedAt: row.updated_at,
    verseCount: row.verse_count,
  };
}

const translationSelect = `
  SELECT t.*, COUNT(v.verse_key) AS verse_count
  FROM translations t
  LEFT JOIN translation_verses v ON v.translation_id = t.id
`;

export async function listTranslations(db: SQLiteDatabase): Promise<InstalledTranslation[]> {
  const rows = await db.getAllAsync<TranslationRow>(
    `${translationSelect} GROUP BY t.id ORDER BY t.title COLLATE NOCASE`,
  );
  return rows.map(mapTranslation);
}

export async function getTranslation(
  db: SQLiteDatabase,
  translationId: string,
): Promise<InstalledTranslation | null> {
  const row = await db.getFirstAsync<TranslationRow>(
    `${translationSelect} WHERE t.id = ? GROUP BY t.id`,
    translationId,
  );
  return row ? mapTranslation(row) : null;
}

export async function listTranslationVerses(
  db: SQLiteDatabase,
  translationId: string,
  surahNumber: number,
): Promise<TranslationVerse[]> {
  const rows = await db.getAllAsync<{ verse_key: TranslationVerse['key']; original_text: string }>(
    `SELECT verse_key, original_text FROM translation_verses
     WHERE translation_id = ? AND surah_number = ? ORDER BY ayah_number`,
    translationId,
    surahNumber,
  );
  return rows.map((row) => ({ key: row.verse_key, text: normalizeTranslationText(row.original_text) }));
}

export async function listTranslationVersesInRange(
  db: SQLiteDatabase,
  translationId: string,
  startSurah: number,
  endSurah: number,
): Promise<TranslationVerse[]> {
  const rows = await db.getAllAsync<{ verse_key: TranslationVerse['key']; original_text: string }>(
    `SELECT verse_key, original_text FROM translation_verses
     WHERE translation_id = ? AND surah_number BETWEEN ? AND ?
     ORDER BY surah_number, ayah_number`,
    translationId,
    startSurah,
    endSurah,
  );
  return rows.map((row) => ({ key: row.verse_key, text: normalizeTranslationText(row.original_text) }));
}

export async function getActiveTranslationId(db: SQLiteDatabase): Promise<string | null> {
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT t.id
     FROM app_settings s
     JOIN translations t ON t.id = s.value
     WHERE s.key = 'active_translation_id'`,
  );
  if (row) return row.id;
  const first = await db.getFirstAsync<{ id: string }>('SELECT id FROM translations ORDER BY imported_at, id LIMIT 1');
  return first?.id ?? null;
}

export async function setActiveTranslationId(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES ('active_translation_id', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    id,
  );
}

export async function deleteTranslation(db: SQLiteDatabase, translationId: string): Promise<boolean> {
  let deleted = false;
  await runAtomicWrite(db, async (transaction) => {
    const existing = await transaction.getFirstAsync<{ id: string }>(
      'SELECT id FROM translations WHERE id = ?',
      translationId,
    );
    if (!existing) return;

    const active = await transaction.getFirstAsync<{ id: string }>(
      `SELECT t.id
       FROM app_settings s
       JOIN translations t ON t.id = s.value
       WHERE s.key = 'active_translation_id'`,
    );
    const fallback = await transaction.getFirstAsync<{ id: string }>(
      `SELECT id FROM translations
       WHERE id <> ?
       ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, imported_at, id
       LIMIT 1`,
      translationId,
      active?.id ?? '',
    );

    if (!active || active.id === translationId) {
      if (fallback) {
        await transaction.runAsync(
          `INSERT INTO app_settings (key, value) VALUES ('active_translation_id', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          fallback.id,
        );
      } else {
        await transaction.runAsync("DELETE FROM app_settings WHERE key = 'active_translation_id'");
      }
    }
    // Expo's native exclusive transaction uses another SQLite connection, where
    // foreign_keys may not inherit the provider connection's PRAGMA setting.
    await transaction.runAsync('DELETE FROM annotations WHERE translation_id = ?', translationId);
    await transaction.runAsync('DELETE FROM translation_verses WHERE translation_id = ?', translationId);
    await transaction.runAsync('DELETE FROM translations WHERE id = ?', translationId);
    deleted = true;
  });
  return deleted;
}

export async function installTranslation(
  db: SQLiteDatabase,
  manifest: TranslationManifest,
  checksum: string,
): Promise<'installed' | 'replaced'> {
  const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM translations WHERE id = ?', manifest.id);
  const now = Date.now();
  await runAtomicWrite(db, async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO translations (
        id, title, language, translator, source_name, source_url, license_name, license_url,
        format_version, content_sha256, imported_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        language = excluded.language,
        translator = excluded.translator,
        source_name = excluded.source_name,
        source_url = excluded.source_url,
        license_name = excluded.license_name,
        license_url = excluded.license_url,
        content_sha256 = excluded.content_sha256,
        updated_at = excluded.updated_at`,
      manifest.id,
      manifest.title,
      manifest.language,
      manifest.translator,
      manifest.source.name,
      manifest.source.url,
      manifest.license.name,
      manifest.license.url,
      checksum,
      now,
      now,
    );
    await transaction.runAsync('DELETE FROM translation_verses WHERE translation_id = ?', manifest.id);
    const statement = await transaction.prepareAsync(
      `INSERT INTO translation_verses
        (translation_id, surah_number, ayah_number, verse_key, original_text)
       VALUES (?, ?, ?, ?, ?)`,
    );
    try {
      for (const verse of manifest.verses) {
        const [surahPart = '0', ayahPart = '0'] = verse.key.split(':');
        const surah = Number(surahPart);
        const ayah = Number(ayahPart);
        await statement.executeAsync(manifest.id, surah, ayah, verse.key, verse.text);
      }
    } finally {
      await statement.finalizeAsync();
    }
    await transaction.runAsync(
      `INSERT INTO app_settings (key, value) VALUES ('active_translation_id', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      manifest.id,
    );
  });
  return existing ? 'replaced' : 'installed';
}

export async function countChangedVerses(
  db: SQLiteDatabase,
  manifest: TranslationManifest,
): Promise<number | null> {
  const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM translations WHERE id = ?', manifest.id);
  if (!existing) return null;
  const rows = await db.getAllAsync<{ verse_key: string; original_text: string }>(
    'SELECT verse_key, original_text FROM translation_verses WHERE translation_id = ?',
    manifest.id,
  );
  const current = new Map(rows.map((row) => [row.verse_key, row.original_text]));
  let changed = 0;
  for (const verse of manifest.verses) if (current.get(verse.key) !== verse.text) changed += 1;
  return changed;
}
