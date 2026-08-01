import { strFromU8, strToU8, unzipSync, zip } from 'fflate';
import type { SQLiteDatabase } from 'expo-sqlite';

import { runAtomicWrite } from '@/platform/database/runAtomicWrite';
import { getReciter, type ReciterId } from '@/features/recitation/domain/reciters';
import {
  deleteDownloadedSurahFiles,
  readDownloadedRecitationFile,
  writeDownloadedRecitationFile,
} from '@/features/recitation/data/recitationFileStore';
import type { HighlightColor, TranslationManifest, VerseAnnotation, VerseKey } from '@/types/domain';
import { assertBackupFormat, type QuranFolioBackup } from '../domain/backupFormat';

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
}

export interface BackupSummary {
  translationCount: number;
  annotationCount: number;
  downloadedSurahCount: number;
  audioFileCount: number;
  createdAt: number;
}

export async function createBackupArchive(db: SQLiteDatabase): Promise<{ bytes: Uint8Array; summary: BackupSummary }> {
  const translationRows = await db.getAllAsync<TranslationRow>('SELECT * FROM translations ORDER BY id');
  const translations = await Promise.all(translationRows.map(async (row) => {
    const verses = await db.getAllAsync<{ verse_key: VerseKey; original_text: string }>(
      'SELECT verse_key, original_text FROM translation_verses WHERE translation_id = ? ORDER BY surah_number, ayah_number',
      row.id,
    );
    const manifest: TranslationManifest = {
      format: 'quran-translation',
      version: 1,
      id: row.id,
      title: row.title,
      language: row.language,
      translator: row.translator,
      source: { name: row.source_name, url: row.source_url },
      license: { name: row.license_name, url: row.license_url },
      verses: verses.map((verse) => ({ key: verse.verse_key, text: verse.original_text })),
    };
    return { manifest, contentSha256: row.content_sha256, importedAt: row.imported_at, updatedAt: row.updated_at };
  }));
  const annotationRows = await db.getAllAsync<{
    translation_id: string; surah_number: number; ayah_number: number; note_text: string | null;
    highlight_color: HighlightColor | null; created_at: number; updated_at: number;
  }>('SELECT * FROM annotations ORDER BY surah_number, ayah_number');
  const annotations: VerseAnnotation[] = annotationRows.map((row) => ({
    translationId: row.translation_id,
    surahNumber: row.surah_number,
    ayahNumber: row.ayah_number,
    noteText: row.note_text,
    highlightColor: row.highlight_color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  const settings = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings ORDER BY key');
  const downloads = await db.getAllAsync<{
    reciter_id: ReciterId; surah_number: number; verse_count: number; byte_count: number; downloaded_at: number;
  }>('SELECT * FROM recitation_downloads ORDER BY reciter_id, surah_number');
  const archiveFiles: Record<string, Uint8Array> = {};
  const audioFiles: QuranFolioBackup['audioFiles'] = [];
  for (const download of downloads) {
    for (let ayah = 1; ayah <= download.verse_count; ayah += 1) {
      const verseKey = `${download.surah_number}:${ayah}` as VerseKey;
      const bytes = await readDownloadedRecitationFile(download.reciter_id, verseKey);
      if (!bytes) throw new Error(`${getReciter(download.reciter_id).name}, Surah ${download.surah_number} is incomplete. Download it again before backing up.`);
      const path = `recitations/${download.reciter_id}/${download.surah_number}/${ayah}.mp3`;
      archiveFiles[path] = bytes;
      audioFiles.push({ reciterId: download.reciter_id, verseKey, path, byteCount: bytes.byteLength });
    }
  }
  const createdAt = Date.now();
  const manifest: QuranFolioBackup = {
    format: 'quran-folio-backup',
    version: 1,
    createdAt,
    translations,
    annotations,
    settings,
    downloads: downloads.map((row) => ({
      reciterId: row.reciter_id,
      surahNumber: row.surah_number,
      verseCount: row.verse_count,
      byteCount: row.byte_count,
      downloadedAt: row.downloaded_at,
    })),
    audioFiles,
  };
  archiveFiles['backup.json'] = strToU8(JSON.stringify(manifest));
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    zip(archiveFiles, { level: 0 }, (error, output) => error ? reject(error) : resolve(output));
  });
  return {
    bytes,
    summary: {
      translationCount: translations.length,
      annotationCount: annotations.length,
      downloadedSurahCount: downloads.length,
      audioFileCount: audioFiles.length,
      createdAt,
    },
  };
}

export function inspectBackupArchive(bytes: Uint8Array): { backup: QuranFolioBackup; files: Record<string, Uint8Array>; summary: BackupSummary } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('This file is not a readable Quran Folio backup.');
  }
  const manifestBytes = files['backup.json'];
  if (!manifestBytes) throw new Error('The backup manifest is missing.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new Error('The backup manifest is not valid JSON.');
  }
  assertBackupFormat(parsed);
  for (const audio of parsed.audioFiles) {
    const file = files[audio.path];
    if (!file || file.byteLength !== audio.byteCount) throw new Error(`Audio file ${audio.path} is missing or damaged.`);
  }
  return {
    backup: parsed,
    files,
    summary: {
      translationCount: parsed.translations.length,
      annotationCount: parsed.annotations.length,
      downloadedSurahCount: parsed.downloads.length,
      audioFileCount: parsed.audioFiles.length,
      createdAt: parsed.createdAt,
    },
  };
}

export async function restoreBackupArchive(db: SQLiteDatabase, bytes: Uint8Array): Promise<BackupSummary> {
  const { backup, files, summary } = inspectBackupArchive(bytes);
  const currentDownloads = await db.getAllAsync<{ reciter_id: ReciterId; surah_number: number }>('SELECT reciter_id, surah_number FROM recitation_downloads');
  for (const audio of backup.audioFiles) await writeDownloadedRecitationFile(audio.reciterId, audio.verseKey, files[audio.path]!);

  await runAtomicWrite(db, async (transaction) => {
    await transaction.execAsync(`DELETE FROM annotations; DELETE FROM translation_verses; DELETE FROM translations; DELETE FROM app_settings; DELETE FROM recitation_downloads;`);
    for (const translation of backup.translations) {
      const item = translation.manifest;
      await transaction.runAsync(
        `INSERT INTO translations (id, title, language, translator, source_name, source_url, license_name, license_url,
          format_version, content_sha256, imported_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        item.id, item.title, item.language, item.translator, item.source.name, item.source.url,
        item.license.name, item.license.url, translation.contentSha256, translation.importedAt, translation.updatedAt,
      );
      for (const verse of item.verses) {
        const [surah = 0, ayah = 0] = verse.key.split(':').map(Number);
        await transaction.runAsync(
          'INSERT INTO translation_verses (translation_id, surah_number, ayah_number, verse_key, original_text) VALUES (?, ?, ?, ?, ?)',
          item.id, surah, ayah, verse.key, verse.text,
        );
      }
    }
    for (const annotation of backup.annotations) {
      await transaction.runAsync(
        `INSERT INTO annotations (translation_id, surah_number, ayah_number, note_text, highlight_color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        annotation.translationId, annotation.surahNumber, annotation.ayahNumber, annotation.noteText,
        annotation.highlightColor, annotation.createdAt, annotation.updatedAt,
      );
    }
    for (const setting of backup.settings) await transaction.runAsync('INSERT INTO app_settings (key, value) VALUES (?, ?)', setting.key, setting.value);
    for (const download of backup.downloads) {
      await transaction.runAsync(
        'INSERT INTO recitation_downloads (reciter_id, surah_number, verse_count, byte_count, downloaded_at) VALUES (?, ?, ?, ?, ?)',
        download.reciterId, download.surahNumber, download.verseCount, download.byteCount, download.downloadedAt,
      );
    }
  });

  const restored = new Set(backup.downloads.map((item) => `${item.reciterId}:${item.surahNumber}`));
  await Promise.all(currentDownloads
    .filter((item) => !restored.has(`${item.reciter_id}:${item.surah_number}`))
    .map((item) => deleteDownloadedSurahFiles(item.reciter_id, item.surah_number)));
  return summary;
}
