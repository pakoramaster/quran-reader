import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateTranslationJson } from '@/features/translations/domain/translationFormat';
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
