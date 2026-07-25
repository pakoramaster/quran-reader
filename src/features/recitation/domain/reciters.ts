import type { VerseKey } from '@/types/domain';

export type ReciterId = 'husary' | 'abdul-basit';
export type PlaybackMode = 'recitation' | 'translation' | 'both';

export interface Reciter {
  id: ReciterId;
  name: string;
  style: string;
  folder: string;
}

export const RECITERS: readonly Reciter[] = [
  { id: 'husary', name: 'Mahmoud Khalil Al-Husary', style: 'Murattal', folder: 'Husary_64kbps' },
  { id: 'abdul-basit', name: 'Abdul Basit Abdus-Samad', style: 'Murattal', folder: 'Abdul_Basit_Murattal_64kbps' },
] as const;

export const DEFAULT_RECITER_ID: ReciterId = 'husary';

export function isReciterId(value: string | null): value is ReciterId {
  return RECITERS.some((reciter) => reciter.id === value);
}

export function getReciter(id: ReciterId): Reciter {
  return RECITERS.find((reciter) => reciter.id === id) ?? RECITERS[0]!;
}

export function getRecitationUrl(reciterId: ReciterId, verseKey: VerseKey): string {
  const [surah, ayah] = verseKey.split(':').map(Number);
  const file = `${String(surah).padStart(3, '0')}${String(ayah).padStart(3, '0')}.mp3`;
  return `https://everyayah.com/data/${getReciter(reciterId).folder}/${file}`;
}
