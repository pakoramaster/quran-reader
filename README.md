# Quran Folio

An offline-first Quran reader for iOS, Android, and Windows built with Expo,
React Native, TypeScript, Expo Router, SQLite, and Electron.

## What works

- Verified Tanzil Uthmani 1.1 Arabic text bundled in a query-only SQLite database.
- Direct translation downloads from [faisalill/quran_db](https://github.com/faisalill/quran_db),
  plus local JSON import with strict validation, checksum, preview, and atomic
  same-ID replacement.
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

## Automated releases

Every push to `main` builds current Windows, Windows 7, and signed Android APK
packages and publishes them to a GitHub release. Configure these repository
Actions secrets before the workflow runs:

- `ANDROID_KEYSTORE_BASE64`: Base64-encoded Android release `.jks` keystore.
- `ANDROID_KEYSTORE_PASSWORD`: Android keystore password.
- `ANDROID_KEY_ALIAS`: Android signing key alias.
- `ANDROID_KEY_PASSWORD`: Android signing key password.

The Android signing file must be backed up securely and must never be committed.
Windows installers are currently unsigned and can trigger Microsoft SmartScreen
warnings. The Windows 7 package uses the unsupported Electron 22 runtime and is
provided only for legacy compatibility. Releases use the package version as the
tag, such as `v0.1.4`; pushes without a version change update that release.
