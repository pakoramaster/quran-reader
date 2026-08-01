import type { HighlightColor, TranslationManifest, VerseAnnotation, VerseKey } from '@/types/domain';
import type { ReciterId } from '@/features/recitation/domain/reciters';

export interface BackupTranslation {
  manifest: TranslationManifest;
  contentSha256: string;
  importedAt: number;
  updatedAt: number;
}

export interface BackupAudioFile {
  reciterId: ReciterId;
  verseKey: VerseKey;
  path: string;
  byteCount: number;
}

export interface QuranFolioBackup {
  format: 'quran-folio-backup';
  version: 1;
  createdAt: number;
  translations: BackupTranslation[];
  annotations: VerseAnnotation[];
  settings: { key: string; value: string }[];
  downloads: {
    reciterId: ReciterId;
    surahNumber: number;
    verseCount: number;
    byteCount: number;
    downloadedAt: number;
  }[];
  audioFiles: BackupAudioFile[];
}

const highlightColors: (HighlightColor | null)[] = [null, 'amber', 'sage', 'sky', 'rose'];
const reciterIds: ReciterId[] = ['husary', 'abdul-basit'];
const verseKeyPattern = /^(?:[1-9]|[1-9]\d|1[01]\d|11[0-4]):[1-9]\d*$/;

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

export function assertBackupFormat(value: unknown): asserts value is QuranFolioBackup {
  if (!value || typeof value !== 'object') throw new Error('The backup manifest is missing.');
  const backup = value as Partial<QuranFolioBackup>;
  if (backup.format !== 'quran-folio-backup' || backup.version !== 1) throw new Error('This backup version is not supported.');
  if (!Array.isArray(backup.translations) || !Array.isArray(backup.annotations)
    || !Array.isArray(backup.settings) || !Array.isArray(backup.downloads) || !Array.isArray(backup.audioFiles)) {
    throw new Error('The backup manifest is incomplete.');
  }
  if (!isNonNegativeInteger(backup.createdAt)) throw new Error('The backup creation date is invalid.');
  const translationIds = new Set<string>();
  for (const translation of backup.translations) {
    if (!translation?.manifest || translation.manifest.format !== 'quran-translation' || translation.manifest.version !== 1
      || typeof translation.manifest.id !== 'string' || !translation.manifest.id
      || typeof translation.manifest.title !== 'string' || typeof translation.manifest.language !== 'string'
      || typeof translation.manifest.translator !== 'string' || !Array.isArray(translation.manifest.verses)
      || typeof translation.contentSha256 !== 'string' || !isNonNegativeInteger(translation.importedAt)
      || !isNonNegativeInteger(translation.updatedAt) || translationIds.has(translation.manifest.id)) {
      throw new Error('A translation record in the backup is invalid.');
    }
    translationIds.add(translation.manifest.id);
    const verseKeys = new Set<string>();
    for (const verse of translation.manifest.verses) {
      if (!verseKeyPattern.test(verse?.key) || typeof verse.text !== 'string' || !verse.text.trim() || verseKeys.has(verse.key)) {
        throw new Error(`Translation ${translation.manifest.id} contains an invalid verse.`);
      }
      verseKeys.add(verse.key);
    }
  }
  for (const annotation of backup.annotations) {
    if (!Number.isInteger(annotation?.surahNumber) || !Number.isInteger(annotation?.ayahNumber)
      || annotation.surahNumber < 1 || annotation.surahNumber > 114 || annotation.ayahNumber < 1
      || !translationIds.has(annotation.translationId) || !highlightColors.includes(annotation?.highlightColor)
      || (annotation.noteText !== null && typeof annotation.noteText !== 'string')
      || (annotation.noteText === null && annotation.highlightColor === null)
      || !isNonNegativeInteger(annotation.createdAt) || !isNonNegativeInteger(annotation.updatedAt)) {
      throw new Error('An annotation in the backup is invalid.');
    }
  }
  const settingKeys = new Set<string>();
  for (const setting of backup.settings) {
    if (typeof setting?.key !== 'string' || !setting.key || typeof setting.value !== 'string' || settingKeys.has(setting.key)) {
      throw new Error('A preference in the backup is invalid.');
    }
    settingKeys.add(setting.key);
  }
  const downloads = new Map<string, QuranFolioBackup['downloads'][number]>();
  for (const download of backup.downloads) {
    const key = `${download?.reciterId}:${download?.surahNumber}`;
    if (!reciterIds.includes(download?.reciterId) || !isPositiveInteger(download?.surahNumber)
      || download.surahNumber > 114 || !isPositiveInteger(download.verseCount)
      || !isNonNegativeInteger(download.byteCount) || !isNonNegativeInteger(download.downloadedAt)
      || downloads.has(key)) throw new Error('A recitation download in the backup is invalid.');
    downloads.set(key, download);
  }
  const audioPaths = new Set<string>();
  const audioByDownload = new Map<string, Map<number, BackupAudioFile>>();
  for (const file of backup.audioFiles) {
    const [surahNumber = 0, ayahNumber = 0] = file?.verseKey?.split(':').map(Number) ?? [];
    const expectedPath = `recitations/${file?.reciterId}/${surahNumber}/${ayahNumber}.mp3`;
    const downloadKey = `${file?.reciterId}:${surahNumber}`;
    if (!reciterIds.includes(file?.reciterId) || !verseKeyPattern.test(file?.verseKey)
      || file.path !== expectedPath || !isPositiveInteger(file.byteCount) || audioPaths.has(file.path)
      || !downloads.has(downloadKey)) {
      throw new Error('An audio entry in the backup is invalid.');
    }
    audioPaths.add(file.path);
    const ayahs = audioByDownload.get(downloadKey) ?? new Map<number, BackupAudioFile>();
    if (ayahs.has(ayahNumber)) throw new Error('An audio entry in the backup is duplicated.');
    ayahs.set(ayahNumber, file);
    audioByDownload.set(downloadKey, ayahs);
  }
  for (const [key, download] of downloads) {
    const ayahs = audioByDownload.get(key);
    if (!ayahs || ayahs.size !== download.verseCount) throw new Error('A downloaded Surah in the backup is incomplete.');
    let byteCount = 0;
    for (let ayah = 1; ayah <= download.verseCount; ayah += 1) {
      const file = ayahs.get(ayah);
      if (!file) throw new Error('A downloaded Surah in the backup is incomplete.');
      byteCount += file.byteCount;
    }
    if (byteCount !== download.byteCount) throw new Error('A downloaded Surah has an invalid byte count.');
  }
}
