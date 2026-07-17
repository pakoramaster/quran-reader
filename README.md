# Quran Folio

An offline-first Quran reader for iOS and Android built with Expo, React Native,
TypeScript, Expo Router, and SQLite.

## What works

- Verified Tanzil Uthmani 1.1 Arabic text bundled in a query-only SQLite database.
- Complete JSON translation import with strict validation, checksum, preview,
  and atomic same-ID replacement.
- Multiple installed translations with one active reading translation.
- Per-Ayah private notes and whole-Ayah highlights, searchable from a Notes tab.
- Single-Ayah and continuous-Surah device text-to-speech.
- No backend or external API for core features.

## Development

```sh
npm install
npm run verify:quran
npm run typecheck
npm run lint
npm test
npm start
```

See `docs/TRANSLATION_FORMAT.md` for the import contract and
`docs/DATA_PROVENANCE.md` for Quran source and licensing details.
