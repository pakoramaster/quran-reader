import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(import.meta.dirname, '..');
const databasePath = resolve(ROOT, 'assets/data/quran.sqlite');
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/data/quran-manifest.json'), 'utf8'));
const databaseHash = createHash('sha256').update(readFileSync(databasePath)).digest('hex');
assert.equal(databaseHash, manifest.databaseSha256, 'Database checksum differs from the generated manifest');

const db = new DatabaseSync(databasePath, { readOnly: true });
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM surahs').get().count, 114);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM ayahs').get().count, 6236);
assert.equal(db.prepare('SELECT ayah_count FROM surahs WHERE number = 2').get().ayah_count, 286);
assert.equal(
  db.prepare('SELECT text_uthmani FROM ayahs WHERE verse_key = ?').get('1:1').text_uthmani,
  'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
);
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
assert.equal(
  db.prepare("SELECT value FROM quran_metadata WHERE key = 'source_sha256'").get().value,
  manifest.sourceSha256,
);
db.close();
console.log('Verified immutable Quran database: 114 surahs, 6,236 ayahs, checksum and integrity OK.');
