import type { SQLiteDatabase } from 'expo-sqlite';

import type { ReciterId } from '@/features/recitation/domain/reciters';
import type { VerseKey } from '@/types/domain';
import { deleteDownloadedSurahFiles, downloadRecitationFile } from './recitationFileStore';

export interface RecitationDownload {
  reciterId: ReciterId;
  surahNumber: number;
  verseCount: number;
  byteCount: number;
  downloadedAt: number;
}

interface DownloadRow {
  reciter_id: ReciterId;
  surah_number: number;
  verse_count: number;
  byte_count: number;
  downloaded_at: number;
}

export async function listRecitationDownloads(db: SQLiteDatabase): Promise<RecitationDownload[]> {
  const rows = await db.getAllAsync<DownloadRow>('SELECT * FROM recitation_downloads ORDER BY reciter_id, surah_number');
  return rows.map((row) => ({
    reciterId: row.reciter_id,
    surahNumber: row.surah_number,
    verseCount: row.verse_count,
    byteCount: row.byte_count,
    downloadedAt: row.downloaded_at,
  }));
}

export async function downloadSurahRecitation(
  db: SQLiteDatabase,
  reciterId: ReciterId,
  surahNumber: number,
  verseKeys: VerseKey[],
  onProgress?: (completed: number, total: number) => void,
): Promise<RecitationDownload> {
  let cursor = 0;
  let completed = 0;
  let byteCount = 0;
  const workers = Array.from({ length: Math.min(4, verseKeys.length) }, async () => {
    while (cursor < verseKeys.length) {
      const index = cursor;
      cursor += 1;
      const verseKey = verseKeys[index];
      if (!verseKey) return;
      const downloadedBytes = await downloadRecitationFile(reciterId, verseKey);
      byteCount += downloadedBytes;
      completed += 1;
      onProgress?.(completed, verseKeys.length);
    }
  });
  await Promise.all(workers);
  const downloadedAt = Date.now();
  await db.runAsync(
    `INSERT INTO recitation_downloads (reciter_id, surah_number, verse_count, byte_count, downloaded_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(reciter_id, surah_number) DO UPDATE SET
       verse_count = excluded.verse_count,
       byte_count = excluded.byte_count,
       downloaded_at = excluded.downloaded_at`,
    reciterId,
    surahNumber,
    verseKeys.length,
    byteCount,
    downloadedAt,
  );
  return { reciterId, surahNumber, verseCount: verseKeys.length, byteCount, downloadedAt };
}

export async function removeSurahRecitation(db: SQLiteDatabase, reciterId: ReciterId, surahNumber: number): Promise<void> {
  await deleteDownloadedSurahFiles(reciterId, surahNumber);
  await db.runAsync('DELETE FROM recitation_downloads WHERE reciter_id = ? AND surah_number = ?', reciterId, surahNumber);
}
