import { getRecitationUrl, type ReciterId } from '@/features/recitation/domain/reciters';
import type { VerseKey } from '@/types/domain';

const CACHE_NAME = 'quran-folio-recitations-v1';

async function cache() {
  if (!globalThis.caches) throw new Error('Offline audio storage is unavailable in this browser.');
  return globalThis.caches.open(CACHE_NAME);
}

export async function downloadRecitationFile(reciterId: ReciterId, verseKey: VerseKey, signal?: AbortSignal): Promise<number> {
  const url = getRecitationUrl(reciterId, verseKey);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Audio download failed (${response.status}).`);
  const bytes = await response.clone().arrayBuffer();
  await (await cache()).put(url, response);
  return bytes.byteLength;
}

export async function getDownloadedRecitationUri(reciterId: ReciterId, verseKey: VerseKey): Promise<string | null> {
  const response = await (await cache()).match(getRecitationUrl(reciterId, verseKey));
  return response ? URL.createObjectURL(await response.blob()) : null;
}

export async function deleteDownloadedSurahFiles(reciterId: ReciterId, surahNumber: number): Promise<void> {
  const storage = await cache();
  const prefix = `${String(surahNumber).padStart(3, '0')}`;
  const requests = await storage.keys();
  await Promise.all(requests
    .filter((request) => request.url.includes(`/${getReciterFolder(reciterId)}/`) && request.url.endsWith('.mp3') && request.url.split('/').pop()?.startsWith(prefix))
    .map((request) => storage.delete(request)));
}

function getReciterFolder(reciterId: ReciterId): string {
  const sample = getRecitationUrl(reciterId, '1:1');
  return sample.split('/data/')[1]?.split('/')[0] ?? reciterId;
}

export async function readDownloadedRecitationFile(reciterId: ReciterId, verseKey: VerseKey): Promise<Uint8Array | null> {
  const response = await (await cache()).match(getRecitationUrl(reciterId, verseKey));
  return response ? new Uint8Array(await response.arrayBuffer()) : null;
}

export async function writeDownloadedRecitationFile(reciterId: ReciterId, verseKey: VerseKey, bytes: Uint8Array): Promise<void> {
  await (await cache()).put(
    getRecitationUrl(reciterId, verseKey),
    new Response(bytes.slice().buffer, { headers: { 'Content-Type': 'audio/mpeg' } }),
  );
}

export function releaseDownloadedRecitationUri(uri: string): void {
  if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
}
