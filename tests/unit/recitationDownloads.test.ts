import { downloadReciterRecitations, downloadSurahRecitation, removeSurahRecitation } from '@/features/recitation/data/recitationDownloadRepository';
import { resolveRecitationPlaybackSource } from '@/features/recitation/data/recitationPlaybackSource';
import { deleteDownloadedSurahFiles, downloadRecitationFile, getDownloadedRecitationUri } from '@/features/recitation/data/recitationFileStore';

jest.mock('@/features/recitation/data/recitationFileStore', () => ({
  deleteDownloadedSurahFiles: jest.fn(),
  downloadRecitationFile: jest.fn(),
  getDownloadedRecitationUri: jest.fn(),
}));

const downloadFile = jest.mocked(downloadRecitationFile);
const getLocalUri = jest.mocked(getDownloadedRecitationUri);
const deleteFiles = jest.mocked(deleteDownloadedSurahFiles);

describe('recitation downloads', () => {
  beforeEach(() => jest.clearAllMocks());

  it('downloads every Ayah for the selected reciter and records the completed Surah', async () => {
    downloadFile.mockImplementation(async (_reciter, verseKey) => Number(verseKey.split(':')[1]) * 10);
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const progress = jest.fn();
    const result = await downloadSurahRecitation({ runAsync } as never, 'abdul-basit', 1, ['1:1', '1:2', '1:3'], progress);

    expect(downloadFile).toHaveBeenCalledTimes(3);
    expect(downloadFile).toHaveBeenCalledWith('abdul-basit', '1:1');
    expect(downloadFile).toHaveBeenCalledWith('abdul-basit', '1:2');
    expect(downloadFile).toHaveBeenCalledWith('abdul-basit', '1:3');
    expect(progress).toHaveBeenLastCalledWith(3, 3);
    expect(runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO recitation_downloads'), 'abdul-basit', 1, 3, 60, expect.any(Number));
    expect(result).toMatchObject({ reciterId: 'abdul-basit', surahNumber: 1, verseCount: 3, byteCount: 60 });
  });

  it('uses a downloaded MP3 before the network URL and removes Surahs by reciter', async () => {
    getLocalUri.mockResolvedValueOnce('file:///recitations/husary/2/2-255.mp3');
    await expect(resolveRecitationPlaybackSource('husary', '2:255')).resolves.toEqual({
      uri: 'file:///recitations/husary/2/2-255.mp3',
      localUri: 'file:///recitations/husary/2/2-255.mp3',
    });

    getLocalUri.mockResolvedValueOnce(null);
    await expect(resolveRecitationPlaybackSource('husary', '2:255')).resolves.toMatchObject({
      localUri: null,
      uri: expect.stringContaining('002255.mp3'),
    });

    const runAsync = jest.fn().mockResolvedValue(undefined);
    await removeSurahRecitation({ runAsync } as never, 'husary', 2);
    expect(deleteFiles).toHaveBeenCalledWith('husary', 2);
    expect(runAsync).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM recitation_downloads'), 'husary', 2);
  });

  it('downloads a complete reciter while skipping Surahs already stored', async () => {
    downloadFile.mockResolvedValue(10);
    const getAllAsync = jest.fn().mockResolvedValue([
      { reciter_id: 'husary', surah_number: 1, verse_count: 7, byte_count: 70, downloaded_at: 1 },
      { reciter_id: 'abdul-basit', surah_number: 2, verse_count: 286, byte_count: 2_860, downloaded_at: 1 },
    ]);
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const progress = jest.fn();

    const result = await downloadReciterRecitations(
      { getAllAsync, runAsync } as never,
      'husary',
      [
        { number: 1, ayahCount: 7 },
        { number: 2, ayahCount: 2 },
        { number: 3, ayahCount: 3 },
      ],
      progress,
    );

    expect(downloadFile).toHaveBeenCalledTimes(5);
    expect(downloadFile).not.toHaveBeenCalledWith('husary', expect.stringMatching(/^1:/));
    expect(runAsync).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ completedSurahs: 2, currentSurahNumber: 3, currentAyah: 3, skippedSurahs: 1, totalSurahs: 3 }));
    expect(result).toEqual({ downloadedSurahs: 2, skippedSurahs: 1, totalSurahs: 3 });
  });
});
