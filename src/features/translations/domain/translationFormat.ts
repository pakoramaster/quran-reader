import { z } from 'zod';

import type { TranslationManifest, VerseKey } from '@/types/domain';
import { normalizeTranslationText } from './translationText';

export const MAX_TRANSLATION_FILE_BYTES = 10 * 1024 * 1024;
export const EXPECTED_VERSE_COUNT = 6236;

const idPattern = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const languagePattern = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const verseKeyPattern = /^(?:[1-9]|[1-9]\d|1[01]\d|11[0-4]):[1-9]\d*$/;

const nullableUrl = z.union([z.url(), z.literal(''), z.null()]).transform((value) => value || null);

const manifestSchema = z.object({
  format: z.literal('quran-translation'),
  version: z.literal(1),
  id: z.string().min(1).max(64).regex(idPattern, 'Use lowercase letters, numbers, dots, dashes, or underscores.'),
  title: z.string().trim().min(1).max(120),
  language: z.string().trim().min(2).max(35).regex(languagePattern, 'Use a BCP-47 language tag such as en or fr-CA.'),
  translator: z.string().trim().min(1).max(120),
  source: z.object({ name: z.string().trim().min(1).max(160), url: nullableUrl }),
  license: z.object({ name: z.string().trim().min(1).max(160), url: nullableUrl }),
  verses: z.array(
    z.object({
      key: z.string().regex(verseKeyPattern, 'Use a verse key such as 2:255.'),
      text: z.string().min(1).max(20_000),
    }),
  ),
});

export interface ImportIssue {
  code: 'json' | 'schema' | 'coverage' | 'duplicate' | 'unknown-key' | 'empty-text';
  message: string;
  verseKey?: string;
}

export type TranslationValidationResult =
  | { ok: true; manifest: TranslationManifest; sourceFormat: 'quran-folio' | 'quran-db' }
  | { ok: false; issues: ImportIssue[] };

function validateManifest(parsed: unknown, canonicalKeys: readonly VerseKey[]): TranslationValidationResult {
  const result = manifestSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.slice(0, 50).map((issue) => ({
        code: 'schema',
        message: `${issue.path.join('.') || 'file'}: ${issue.message}`,
      })),
    };
  }

  const issues: ImportIssue[] = [];
  const canonical = new Set<string>(canonicalKeys);
  const found = new Set<string>();
  const verses = result.data.verses.map((verse) => ({
    key: verse.key as VerseKey,
    text: normalizeTranslationText(verse.text),
  }));

  for (const verse of verses) {
    if (found.has(verse.key)) issues.push({ code: 'duplicate', message: `Duplicate verse key ${verse.key}.`, verseKey: verse.key });
    found.add(verse.key);
    if (!canonical.has(verse.key)) issues.push({ code: 'unknown-key', message: `Unknown verse key ${verse.key}.`, verseKey: verse.key });
    if (!verse.text.trim()) issues.push({ code: 'empty-text', message: `Verse ${verse.key} has no translation text.`, verseKey: verse.key });
    if (issues.length >= 100) break;
  }

  const missing = canonicalKeys.filter((key) => !found.has(key));
  if (verses.length !== EXPECTED_VERSE_COUNT || missing.length > 0) {
    issues.push({
      code: 'coverage',
      message: `A complete translation needs ${EXPECTED_VERSE_COUNT.toLocaleString()} unique verses. ` +
        `${missing.length.toLocaleString()} canonical verses are missing.`,
    });
  }

  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    sourceFormat: 'quran-folio',
    manifest: {
      ...result.data,
      source: { name: result.data.source.name, url: result.data.source.url },
      license: { name: result.data.license.name, url: result.data.license.url },
      verses,
    } as TranslationManifest,
  };
}

export function quranDbTranslationIdFromFileName(fileName: string): string {
  const base = fileName.replace(/\.json$/i, '').toLowerCase();
  const slug = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'translation';
  return `quran-db-${slug}`.slice(0, 64).replace(/-+$/g, '');
}

function validateQuranDb(parsed: unknown, canonicalKeys: readonly VerseKey[], fileName: string): TranslationValidationResult {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, issues: [{ code: 'schema', message: 'The quran_db file must contain a Surah object.' }] };
  }

  const root = parsed as Record<string, unknown>;
  const verses: TranslationManifest['verses'] = [];
  const issues: ImportIssue[] = [];
  const canonical = new Set<string>(canonicalKeys);
  let translator: string | null = null;

  for (const [surahNumber, rawSurah] of Object.entries(root)) {
    if (!/^\d+$/.test(surahNumber) || !rawSurah || typeof rawSurah !== 'object' || Array.isArray(rawSurah)) continue;
    const ayahs = (rawSurah as Record<string, unknown>).Ayahs;
    if (!ayahs || typeof ayahs !== 'object' || Array.isArray(ayahs)) continue;
    for (const ayahNumber of Object.keys(ayahs)) {
      const candidate = `${Number(surahNumber)}:${Number(ayahNumber)}`;
      if (!canonical.has(candidate)) {
        issues.push({ code: 'unknown-key', message: `Unknown verse key ${candidate}.`, verseKey: candidate });
        if (issues.length >= 100) break;
      }
    }
    if (issues.length >= 100) break;
  }

  for (const key of canonicalKeys) {
    const [surahNumber, ayahNumber] = key.split(':');
    const surah = root[surahNumber!] as Record<string, unknown> | undefined;
    const ayahs = surah?.Ayahs as Record<string, unknown> | undefined;
    const ayah = ayahs?.[ayahNumber!] as Record<string, unknown> | undefined;
    if (!ayah || typeof ayah !== 'object' || Array.isArray(ayah)) continue;

    const textEntries = Object.entries(ayah).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    if (textEntries.length !== 1) {
      issues.push({ code: 'schema', message: `Verse ${key} must contain exactly one translator text field.`, verseKey: key });
      if (issues.length >= 100) break;
      continue;
    }
    const [name, rawText] = textEntries[0]!;
    if (translator && name !== translator) {
      issues.push({ code: 'schema', message: `Verse ${key} uses translator field “${name}” instead of “${translator}”.`, verseKey: key });
    } else {
      translator = name;
    }
    const text = normalizeTranslationText(rawText).trim();
    if (!text) issues.push({ code: 'empty-text', message: `Verse ${key} has no translation text.`, verseKey: key });
    else if (text.length > 20_000) issues.push({ code: 'schema', message: `Verse ${key} exceeds 20,000 characters.`, verseKey: key });
    else verses.push({ key, text });
    if (issues.length >= 100) break;
  }

  if (!translator || verses.length === 0) issues.push({ code: 'schema', message: 'No quran_db translation verses were found.' });
  if (issues.length) return { ok: false, issues };

  return {
    ok: true,
    sourceFormat: 'quran-db',
    manifest: {
      format: 'quran-translation',
      version: 1,
      id: quranDbTranslationIdFromFileName(fileName),
      title: translator!,
      language: translator!.toLowerCase() === 'arabic' ? 'ar' : 'en',
      translator: translator!,
      source: { name: `faisalill/quran_db (${fileName})`, url: 'https://github.com/faisalill/quran_db' },
      license: { name: 'Licence not specified by source; imported by user', url: null },
      verses,
    },
  };
}

export function validateTranslationJson(
  raw: string,
  canonicalKeys: readonly VerseKey[],
): TranslationValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, issues: [{ code: 'json', message: 'The selected file is not valid JSON.' }] };
  }

  return validateManifest(parsed, canonicalKeys);
}

export function validateTranslationFile(
  raw: string,
  canonicalKeys: readonly VerseKey[],
  fileName: string,
): TranslationValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, issues: [{ code: 'json', message: 'The selected file is not valid JSON.' }] };
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'format' in parsed) {
    return validateManifest(parsed, canonicalKeys);
  }
  return validateQuranDb(parsed, canonicalKeys, fileName);
}
