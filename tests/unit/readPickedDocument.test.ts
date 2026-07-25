import { readPickedDocument } from '@/platform/documents/readPickedDocument.web';

describe('readPickedDocument on web', () => {
  it('reads the browser File supplied by DocumentPicker', async () => {
    const text = jest.fn().mockResolvedValue('{"format":"quran-folio-translation"}');
    const document = { uri: 'blob:http://localhost/example', file: { text } };

    await expect(readPickedDocument(document as never)).resolves.toBe('{"format":"quran-folio-translation"}');
    expect(text).toHaveBeenCalledTimes(1);
  });

  it('reports a missing browser File clearly', async () => {
    expect(() => readPickedDocument({ uri: 'blob:http://localhost/missing' } as never))
      .toThrow('selected browser file is unavailable');
  });
});
