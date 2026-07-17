import { z } from 'zod';

import type { TranslationManifest, VerseKey } from '@/types/domain';

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
  | { ok: true; manifest: TranslationManifest }
  | { ok: false; issues: ImportIssue[] };

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
    text: verse.text.replace(/\r\n?/g, '\n'),
  }));

  for (const verse of verses) {
    if (found.has(verse.key)) {
      issues.push({ code: 'duplicate', message: `Duplicate verse key ${verse.key}.`, verseKey: verse.key });
    }
    found.add(verse.key);
    if (!canonical.has(verse.key)) {
      issues.push({ code: 'unknown-key', message: `Unknown verse key ${verse.key}.`, verseKey: verse.key });
    }
    if (!verse.text.trim()) {
      issues.push({ code: 'empty-text', message: `Verse ${verse.key} has no translation text.`, verseKey: verse.key });
    }
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
    manifest: {
      ...result.data,
      source: { name: result.data.source.name, url: result.data.source.url },
      license: { name: result.data.license.name, url: result.data.license.url },
      verses,
    } as TranslationManifest,
  };
}
