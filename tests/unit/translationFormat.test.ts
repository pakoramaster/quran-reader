import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateTranslationFile, validateTranslationJson } from '@/features/translations/domain/translationFormat';
import { normalizeTranslationText } from '@/features/translations/domain/translationText';
import type { TranslationManifest, VerseKey } from '@/types/domain';

function canonicalKeys(): VerseKey[] {
  const xml = readFileSync(resolve(process.cwd(), 'vendor/tanzil/quran-uthmani-v1.1.xml'), 'utf8');
  const keys: VerseKey[] = [];
  for (const surah of xml.matchAll(/<sura index="(\d+)" name="[^"]+">([\s\S]*?)<\/sura>/g)) {
    const surahNumber = Number(surah[1]);
    for (const ayah of (surah[2] ?? '').matchAll(/<aya index="(\d+)"/g)) {
      keys.push(`${surahNumber}:${Number(ayah[1])}`);
    }
  }
  return keys;
}

const keys = canonicalKeys();

function validManifest(): TranslationManifest {
  return {
    format: 'quran-translation',
    version: 1,
    id: 'test-en-2026',
    title: 'Test Translation',
    language: 'en',
    translator: 'Test Translator',
    source: { name: 'Test source', url: 'https://example.com/source' },
    license: { name: 'Private test data', url: null },
    verses: keys.map((key) => ({ key, text: `Translation for ${key}` })),
  };
}

describe('validateTranslationJson', () => {
  it('accepts a complete manifest with every canonical verse key', () => {
    const result = validateTranslationJson(JSON.stringify(validManifest()), keys);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.verses).toHaveLength(6236);
  });

  it('reports malformed JSON without throwing', () => {
    const result = validateTranslationJson('{"format":', keys);
    expect(result).toEqual({
      ok: false,
      issues: [{ code: 'json', message: 'The selected file is not valid JSON.' }],
    });
  });

  it('rejects a duplicate and the canonical verse it displaces', () => {
    const manifest = validManifest();
    manifest.verses[1] = { ...manifest.verses[0]! };
    const result = validateTranslationJson(JSON.stringify(manifest), keys);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'duplicate')).toBe(true);
      expect(result.issues.some((issue) => issue.code === 'coverage')).toBe(true);
    }
  });

  it('rejects unknown verse keys and empty translation text', () => {
    const manifest = validManifest();
    manifest.verses[0] = { key: '1:999', text: 'Unknown' };
    manifest.verses[1] = { ...manifest.verses[1]!, text: '   ' };
    const result = validateTranslationJson(JSON.stringify(manifest), keys);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'unknown-key')).toBe(true);
      expect(result.issues.some((issue) => issue.code === 'empty-text')).toBe(true);
    }
  });

  it('rejects unsupported metadata and schema versions', () => {
    const manifest = { ...validManifest(), version: 2, id: 'Contains Spaces' };
    const result = validateTranslationJson(JSON.stringify(manifest), keys);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.every((issue) => issue.code === 'schema')).toBe(true);
  });
});

describe('validateTranslationFile', () => {
  function quranDbFixture(selectedKeys: readonly VerseKey[] = keys) {
    const root: Record<string, { Ayahs: Record<string, { 'Test Translator': string }> }> = {};
    for (const key of selectedKeys) {
      const [surah, ayah] = key.split(':');
      root[surah!] ??= { Ayahs: {} };
      root[surah!]!.Ayahs[ayah!] = { 'Test Translator': `Translation for ${key}` };
    }
    return root;
  }

  it('converts a complete faisalill/quran_db file to the canonical manifest', () => {
    const result = validateTranslationFile(JSON.stringify(quranDbFixture()), keys, 'testtranslator.json');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sourceFormat).toBe('quran-db');
      expect(result.manifest.id).toBe('quran-db-testtranslator');
      expect(result.manifest.translator).toBe('Test Translator');
      expect(result.manifest.verses).toHaveLength(6236);
      expect(result.manifest.verses[0]).toEqual({ key: '1:1', text: 'Translation for 1:1' });
    }
  });

  it('accepts a partial quran_db translation and reports its actual verse set', () => {
    const result = validateTranslationFile(JSON.stringify(quranDbFixture(keys.slice(0, 7))), keys, 'partial.json');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.verses).toHaveLength(7);
  });

  it('rejects unknown quran_db verse keys', () => {
    const fixture = quranDbFixture(keys.slice(0, 1));
    fixture['115'] = { Ayahs: { '1': { 'Test Translator': 'Unknown verse' } } };
    const result = validateTranslationFile(JSON.stringify(fixture), keys, 'invalid.json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.code === 'unknown-key')).toBe(true);
  });
});

describe('normalizeTranslationText', () => {
  it('decodes named and numeric HTML entities used by Muhammad Asad', () => {
    expect(normalizeTranslationText('&quot;Do not&#91; test &#93;&ldquo;this&rdquo;&quot;')).toBe('"Do not[ test ]“this”"');
    expect(normalizeTranslationText('&lsquo;word&rsquo; &ndash; thought &mdash; &hellip;')).toBe('‘word’ – thought — …');
  });

  it('decodes hexadecimal and double-escaped entities without damaging unknown names', () => {
    expect(normalizeTranslationText('&#x201C;Text&#x201D; &amp;quot;again&amp;quot; &custom;')).toBe('“Text” "again" &custom;');
  });
});
