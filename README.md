# Quran Folio

An offline-first Quran reader for iOS, Android, and Windows built with Expo,
React Native, TypeScript, Expo Router, SQLite, and Electron.

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

## Windows desktop

The Electron application uses the Expo web target while retaining the shared
React Native screens and application logic. The packaged app serves its files
from a loopback-only origin with cross-origin isolation enabled for SQLite's
WebAssembly worker.

```sh
# Expo development server and Electron window
npm run desktop:dev

# Unpacked app for local verification
npm run desktop:build

# Windows NSIS installer
npm run desktop:package
```

Build outputs are written to `release/`. Production installers should be code
signed before distribution to avoid Windows SmartScreen warnings.

See `docs/WINDOWS_DESKTOP.md` for the Electron security, persistence, and
platform-adapter architecture.

See `docs/TRANSLATION_FORMAT.md` for the import contract and
`docs/DATA_PROVENANCE.md` for Quran source and licensing details.
