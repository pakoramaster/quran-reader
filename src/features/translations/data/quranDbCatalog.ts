import { MAX_TRANSLATION_FILE_BYTES } from '../domain/translationFormat';

export const QURAN_DB_REPOSITORY_URL = 'https://github.com/faisalill/quran_db';

const QURAN_DB_CONTENTS_URL = 'https://api.github.com/repos/faisalill/quran_db/contents';
const QURAN_DB_RAW_ROOT = 'https://raw.githubusercontent.com/faisalill/quran_db/main';

export interface QuranDbCatalogItem {
  fileName: string;
  size: number;
}

interface GithubContentItem {
  name?: unknown;
  size?: unknown;
  type?: unknown;
}

type Fetcher = typeof fetch;

export async function listQuranDbTranslations(fetcher: Fetcher = fetch): Promise<QuranDbCatalogItem[]> {
  const response = await fetcher(QURAN_DB_CONTENTS_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    throw new Error(`The translation catalog could not be loaded (${response.status}).`);
  }

  const contents: unknown = await response.json();
  if (!Array.isArray(contents)) throw new Error('The translation catalog returned an unexpected response.');

  return contents
    .filter((item): item is GithubContentItem => Boolean(item) && typeof item === 'object')
    .filter((item) => item.type === 'file' && typeof item.name === 'string' && /\.json$/i.test(item.name))
    .map((item) => ({ fileName: item.name as string, size: typeof item.size === 'number' ? item.size : 0 }))
    .sort((left, right) => left.fileName.localeCompare(right.fileName));
}

export async function downloadQuranDbTranslation(
  item: QuranDbCatalogItem,
  fetcher: Fetcher = fetch,
): Promise<string> {
  if (!item.fileName || item.fileName.includes('/') || item.fileName.includes('\\')) {
    throw new Error('The selected translation file name is invalid.');
  }
  if (item.size > MAX_TRANSLATION_FILE_BYTES) {
    throw new Error('The translation is larger than the 10 MB import limit.');
  }

  const response = await fetcher(`${QURAN_DB_RAW_ROOT}/${encodeURIComponent(item.fileName)}`, {
    headers: { Accept: 'application/json, text/json' },
  });
  if (!response.ok) throw new Error(`The translation download failed (${response.status}).`);

  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_TRANSLATION_FILE_BYTES) {
    throw new Error('The translation is larger than the 10 MB import limit.');
  }
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_TRANSLATION_FILE_BYTES) {
    throw new Error('The translation is larger than the 10 MB import limit.');
  }
  return raw;
}

export function formatQuranDbFileName(fileName: string): string {
  return fileName.replace(/\.json$/i, '').replace(/(\d{4})$/, ' $1');
}
