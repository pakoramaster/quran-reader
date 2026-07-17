import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE = resolve(ROOT, 'vendor/tanzil/quran-uthmani-v1.1.xml');
const OUTPUT = resolve(ROOT, 'assets/data/quran.sqlite');
const MANIFEST = resolve(ROOT, 'assets/data/quran-manifest.json');

const SOURCE_SHA256 = '203f0f1bf3158b1e5be4ab9f8f6870e570aab6d9a626fe6192a70b75d4afe0fd';
const SURAH_NAMES = [
  'Al-Fatihah', 'Al-Baqarah', 'Ali Imran', 'An-Nisa', 'Al-Maidah', 'Al-Anam',
  'Al-Araf', 'Al-Anfal', 'At-Tawbah', 'Yunus', 'Hud', 'Yusuf', 'Ar-Rad',
  'Ibrahim', 'Al-Hijr', 'An-Nahl', 'Al-Isra', 'Al-Kahf', 'Maryam', 'Taha',
  'Al-Anbiya', 'Al-Hajj', 'Al-Muminun', 'An-Nur', 'Al-Furqan', 'Ash-Shuara',
  'An-Naml', 'Al-Qasas', 'Al-Ankabut', 'Ar-Rum', 'Luqman', 'As-Sajdah',
  'Al-Ahzab', 'Saba', 'Fatir', 'Ya-Sin', 'As-Saffat', 'Sad', 'Az-Zumar',
  'Ghafir', 'Fussilat', 'Ash-Shura', 'Az-Zukhruf', 'Ad-Dukhan', 'Al-Jathiyah',
  'Al-Ahqaf', 'Muhammad', 'Al-Fath', 'Al-Hujurat', 'Qaf', 'Adh-Dhariyat',
  'At-Tur', 'An-Najm', 'Al-Qamar', 'Ar-Rahman', 'Al-Waqiah', 'Al-Hadid',
  'Al-Mujadilah', 'Al-Hashr', 'Al-Mumtahanah', 'As-Saff', 'Al-Jumuah',
  'Al-Munafiqun', 'At-Taghabun', 'At-Talaq', 'At-Tahrim', 'Al-Mulk',
  'Al-Qalam', 'Al-Haqqah', 'Al-Maarij', 'Nuh', 'Al-Jinn', 'Al-Muzzammil',
  'Al-Muddaththir', 'Al-Qiyamah', 'Al-Insan', 'Al-Mursalat', 'An-Naba',
  'An-Naziat', 'Abasa', 'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin',
  'Al-Inshiqaq', 'Al-Buruj', 'At-Tariq', 'Al-Ala', 'Al-Ghashiyah', 'Al-Fajr',
  'Al-Balad', 'Ash-Shams', 'Al-Layl', 'Ad-Duha', 'Ash-Sharh', 'At-Tin',
  'Al-Alaq', 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', 'Al-Adiyat',
  'Al-Qariah', 'At-Takathur', 'Al-Asr', 'Al-Humazah', 'Al-Fil', 'Quraysh',
  'Al-Maun', 'Al-Kawthar', 'Al-Kafirun', 'An-Nasr', 'Al-Masad', 'Al-Ikhlas',
  'Al-Falaq', 'An-Nas',
];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

const sourceBuffer = readFileSync(SOURCE);
const sourceHash = sha256(sourceBuffer);
if (sourceHash !== SOURCE_SHA256) {
  throw new Error(`Tanzil source checksum mismatch: expected ${SOURCE_SHA256}, received ${sourceHash}`);
}

const xml = sourceBuffer.toString('utf8');
const surahs = [...xml.matchAll(/<sura index="(\d+)" name="([^"]+)">([\s\S]*?)<\/sura>/g)].map(
  ([, number, nameArabic, body]) => {
    const ayahs = [...body.matchAll(/<aya index="(\d+)" text="([^"]+)"(?: bismillah="[^"]+")? \/>/g)].map(
      ([, ayahNumber, text]) => ({ ayahNumber: Number(ayahNumber), text }),
    );
    return { number: Number(number), nameArabic, ayahs };
  },
);

if (surahs.length !== 114 || surahs.reduce((sum, surah) => sum + surah.ayahs.length, 0) !== 6236) {
  throw new Error('The approved Tanzil source must contain 114 surahs and 6,236 ayahs.');
}

mkdirSync(dirname(OUTPUT), { recursive: true });
rmSync(OUTPUT, { force: true });
const db = new DatabaseSync(OUTPUT);
db.exec(`
  PRAGMA journal_mode = DELETE;
  PRAGMA foreign_keys = ON;
  CREATE TABLE quran_metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  ) STRICT;
  CREATE TABLE surahs (
    number INTEGER PRIMARY KEY NOT NULL CHECK (number BETWEEN 1 AND 114),
    name_arabic TEXT NOT NULL,
    name_transliterated TEXT NOT NULL,
    ayah_count INTEGER NOT NULL CHECK (ayah_count > 0)
  ) STRICT;
  CREATE TABLE ayahs (
    surah_number INTEGER NOT NULL,
    ayah_number INTEGER NOT NULL CHECK (ayah_number > 0),
    verse_key TEXT NOT NULL UNIQUE,
    text_uthmani TEXT NOT NULL,
    PRIMARY KEY (surah_number, ayah_number),
    FOREIGN KEY (surah_number) REFERENCES surahs(number)
  ) STRICT;
  CREATE INDEX ayahs_surah_index ON ayahs(surah_number, ayah_number);
`);

const insertMetadata = db.prepare('INSERT INTO quran_metadata (key, value) VALUES (?, ?)');
const insertSurah = db.prepare(
  'INSERT INTO surahs (number, name_arabic, name_transliterated, ayah_count) VALUES (?, ?, ?, ?)',
);
const insertAyah = db.prepare(
  'INSERT INTO ayahs (surah_number, ayah_number, verse_key, text_uthmani) VALUES (?, ?, ?, ?)',
);

db.exec('BEGIN IMMEDIATE');
try {
  const metadata = {
    source_name: 'Tanzil Project',
    source_url: 'https://tanzil.net',
    source_updates_url: 'https://tanzil.net/docs/text_updates',
    source_version: 'Uthmani 1.1',
    source_sha256: SOURCE_SHA256,
    license: 'Creative Commons Attribution 3.0',
    surah_count: '114',
    ayah_count: '6236',
  };
  for (const [key, value] of Object.entries(metadata)) insertMetadata.run(key, value);

  for (const surah of surahs) {
    insertSurah.run(
      surah.number,
      surah.nameArabic,
      SURAH_NAMES[surah.number - 1],
      surah.ayahs.length,
    );
    for (const ayah of surah.ayahs) {
      insertAyah.run(surah.number, ayah.ayahNumber, `${surah.number}:${ayah.ayahNumber}`, ayah.text);
    }
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.close();
}

const databaseHash = sha256(readFileSync(OUTPUT));
writeFileSync(
  MANIFEST,
  `${JSON.stringify({
    source: 'Tanzil Quran Text (Uthmani, Version 1.1)',
    sourceUrl: 'https://tanzil.net',
    license: 'CC BY 3.0',
    sourceSha256: SOURCE_SHA256,
    databaseSha256: databaseHash,
    surahCount: 114,
    ayahCount: 6236,
  }, null, 2)}\n`,
);

console.log(`Built ${OUTPUT}`);
console.log(`Database SHA-256: ${databaseHash}`);
