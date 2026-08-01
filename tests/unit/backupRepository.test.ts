import {
  createBackupArchive,
  inspectBackupArchive,
  restoreBackupArchive,
} from '@/features/backup/data/backupRepository';
import {
  deleteDownloadedSurahFiles,
  readDownloadedRecitationFile,
  writeDownloadedRecitationFile,
} from '@/features/recitation/data/recitationFileStore';

jest.mock('@/features/recitation/data/recitationFileStore', () => ({
  deleteDownloadedSurahFiles: jest.fn(),
  readDownloadedRecitationFile: jest.fn(),
  writeDownloadedRecitationFile: jest.fn(),
}));
jest.mock('@/platform/database/runAtomicWrite', () => ({
  runAtomicWrite: jest.fn(async (db, work) => work(db)),
}));

const readAudio = jest.mocked(readDownloadedRecitationFile);
const writeAudio = jest.mocked(writeDownloadedRecitationFile);
const deleteAudio = jest.mocked(deleteDownloadedSurahFiles);

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

  it('writes MP3s and atomically restores every user-data table', async () => {
    const archive = await createBackupArchive(sourceDatabase());
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const execAsync = jest.fn().mockResolvedValue(undefined);
    const getAllAsync = jest.fn().mockResolvedValue([{ reciter_id: 'abdul-basit', surah_number: 2 }]);
    await restoreBackupArchive({ execAsync, getAllAsync, runAsync } as never, archive.bytes);

    expect(writeAudio).toHaveBeenCalledTimes(2);
    expect(writeAudio).toHaveBeenCalledWith('husary', '1:1', new Uint8Array([1, 2]));
    expect(writeAudio).toHaveBeenCalledWith('husary', '1:2', new Uint8Array([3, 4, 5]));
    expect(execAsync).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM translations'));
    expect(runAsync.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO translations'))).toBe(true);
    expect(runAsync.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO translation_verses'))).toBe(true);
    expect(runAsync.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO annotations'))).toBe(true);
    expect(runAsync.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO app_settings'))).toBe(true);
    expect(runAsync.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO recitation_downloads'))).toBe(true);
    expect(deleteAudio).toHaveBeenCalledWith('abdul-basit', 2);
  });
});
