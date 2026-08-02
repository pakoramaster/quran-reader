import {
  downloadQuranDbTranslation,
  formatQuranDbFileName,
  listQuranDbTranslations,
} from '@/features/translations/data/quranDbCatalog';

describe('quran_db translation catalog', () => {
  it('keeps only JSON files and sorts them by file name', async () => {
    const fetcher = jest.fn(async () => new Response(JSON.stringify([
      { name: 'zeta.json', size: 20, type: 'file' },
      { name: 'app', size: 0, type: 'dir' },
      { name: 'README.md', size: 30, type: 'file' },
      { name: 'alpha.json', size: 10, type: 'file' },
    ]), { status: 200 }));

    await expect(listQuranDbTranslations(fetcher as typeof fetch)).resolves.toEqual([
      { fileName: 'alpha.json', size: 10 },
      { fileName: 'zeta.json', size: 20 },
    ]);
  });

  it('downloads a selected file from the repository raw URL', async () => {
    const fetcher = jest.fn(async () => new Response('{"1":{}}', {
      headers: { 'content-length': '8' },
      status: 200,
    }));

    await expect(downloadQuranDbTranslation(
      { fileName: 'test translation.json', size: 8 },
      fetcher as typeof fetch,
    )).resolves.toBe('{"1":{}}');
    expect(fetcher).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/faisalill/quran_db/main/test%20translation.json',
      expect.any(Object),
    );
  });

  it('reports API and download failures clearly', async () => {
    const fetcher = jest.fn(async () => new Response('', { status: 403 }));
    await expect(listQuranDbTranslations(fetcher as typeof fetch)).rejects.toThrow('(403)');
    await expect(downloadQuranDbTranslation(
      { fileName: 'test.json', size: 8 },
      fetcher as typeof fetch,
    )).rejects.toThrow('(403)');
  });

  it('makes compact repository file names more readable', () => {
    expect(formatQuranDbFileName('mustafakhattab2018.json')).toBe('mustafakhattab 2018');
  });
});
