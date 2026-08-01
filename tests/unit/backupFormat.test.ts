import { strToU8, zipSync } from 'fflate';

import { inspectBackupArchive } from '@/features/backup/data/backupRepository';
import type { QuranFolioBackup } from '@/features/backup/domain/backupFormat';

jest.mock('@/features/recitation/data/recitationFileStore', () => ({
  deleteDownloadedSurahFiles: jest.fn(),
  readDownloadedRecitationFile: jest.fn(),
  writeDownloadedRecitationFile: jest.fn(),
}));

function manifest(): QuranFolioBackup {
  return {
    format: 'quran-folio-backup',
    version: 1,
    createdAt: 123,
    translations: [],
    annotations: [],
    settings: [{ key: 'reading_font_size', value: 'large' }],
    downloads: [{ reciterId: 'husary', surahNumber: 1, verseCount: 1, byteCount: 3, downloadedAt: 100 }],
    audioFiles: [{ reciterId: 'husary', verseKey: '1:1', path: 'recitations/husary/1/1.mp3', byteCount: 3 }],
  };
}

describe('Quran Folio backup format', () => {
  it('validates a versioned archive and its audio payload', () => {
    const backup = manifest();
    const archive = zipSync({
      'backup.json': strToU8(JSON.stringify(backup)),
      'recitations/husary/1/1.mp3': new Uint8Array([1, 2, 3]),
    });
    expect(inspectBackupArchive(archive).summary).toEqual({
      translationCount: 0,
      annotationCount: 0,
      downloadedSurahCount: 1,
      audioFileCount: 1,
      createdAt: 123,
    });
  });

  it('rejects an archive with a missing audio file', () => {
    const archive = zipSync({ 'backup.json': strToU8(JSON.stringify(manifest())) });
    expect(() => inspectBackupArchive(archive)).toThrow(/missing or damaged/i);
  });

  it('rejects a download record that does not enumerate every stored Ayah', () => {
    const backup = manifest();
    backup.audioFiles = [];
    const archive = zipSync({ 'backup.json': strToU8(JSON.stringify(backup)) });
    expect(() => inspectBackupArchive(archive)).toThrow(/downloaded Surah.*incomplete/i);
  });
});
