import { Directory, File, Paths } from 'expo-file-system';

import { getRecitationUrl, type ReciterId } from '@/features/recitation/domain/reciters';
import type { VerseKey } from '@/types/domain';

function surahDirectory(reciterId: ReciterId, surahNumber: number) {
  return new Directory(Paths.document, 'recitations', reciterId, String(surahNumber));
}

function verseFile(reciterId: ReciterId, verseKey: VerseKey) {
  const [surahNumber] = verseKey.split(':').map(Number);
  return new File(surahDirectory(reciterId, surahNumber ?? 0), `${verseKey.replace(':', '-')}.mp3`);
}

export async function downloadRecitationFile(reciterId: ReciterId, verseKey: VerseKey): Promise<number> {
  const directory = surahDirectory(reciterId, Number(verseKey.split(':')[0]));
  directory.create({ intermediates: true, idempotent: true });
  const output = await File.downloadFileAsync(
    getRecitationUrl(reciterId, verseKey),
    verseFile(reciterId, verseKey),
    { idempotent: true },
  );
  return output.size;
}

export async function getDownloadedRecitationUri(reciterId: ReciterId, verseKey: VerseKey): Promise<string | null> {
  const file = verseFile(reciterId, verseKey);
  return file.exists && file.size > 0 ? file.uri : null;
}

export async function deleteDownloadedSurahFiles(reciterId: ReciterId, surahNumber: number): Promise<void> {
  const directory = surahDirectory(reciterId, surahNumber);
  if (directory.exists) directory.delete();
}

export async function readDownloadedRecitationFile(reciterId: ReciterId, verseKey: VerseKey): Promise<Uint8Array | null> {
  const file = verseFile(reciterId, verseKey);
  return file.exists ? file.bytes() : null;
}

export async function writeDownloadedRecitationFile(reciterId: ReciterId, verseKey: VerseKey, bytes: Uint8Array): Promise<void> {
  const directory = surahDirectory(reciterId, Number(verseKey.split(':')[0]));
  directory.create({ intermediates: true, idempotent: true });
  const file = verseFile(reciterId, verseKey);
  file.create({ intermediates: true, overwrite: true });
  file.write(bytes);
}

export function releaseDownloadedRecitationUri(_uri: string): void {
  // Native file URIs do not need explicit lifetime management.
}
