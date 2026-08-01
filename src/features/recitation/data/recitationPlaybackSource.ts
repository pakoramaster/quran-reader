import { getDownloadedRecitationUri } from '@/features/recitation/data/recitationFileStore';
import { getRecitationUrl, type ReciterId } from '@/features/recitation/domain/reciters';
import type { VerseKey } from '@/types/domain';

export interface RecitationPlaybackSource {
  uri: string;
  localUri: string | null;
}

export async function resolveRecitationPlaybackSource(
  reciterId: ReciterId,
  verseKey: VerseKey,
): Promise<RecitationPlaybackSource> {
  try {
    const localUri = await getDownloadedRecitationUri(reciterId, verseKey);
    if (localUri) return { uri: localUri, localUri };
  } catch {
    // A damaged or unavailable local cache should not prevent online playback.
  }
  return { uri: getRecitationUrl(reciterId, verseKey), localUri: null };
}
