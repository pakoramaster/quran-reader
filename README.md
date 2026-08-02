# Quran Folio

Quran Folio is a private, offline-first Quran reader for Android, iOS, and
Windows. It is built with Expo, React Native, TypeScript, Expo Router, SQLite,
and an Electron desktop shell.

The verified Arabic Quran is bundled with the app. Reading, search, notes,
highlights, installed translations, downloaded recitations, and text-to-speech
can all work locally; a connection is only needed to acquire optional content
that has not yet been downloaded.

## Features

- Verified Tanzil Uthmani 1.1 Arabic text in a read-only SQLite database.
- Multiple installed translations with one active reading translation.
- Translation downloads from
  [faisalill/quran_db](https://github.com/faisalill/quran_db), plus validated
  local JSON import with checksum, preview, and atomic replacement.
- Private per-Ayah notes and whole-Ayah highlights with Notes-tab search.
- Ayah and Surah playback with recitation, translated speech, or both.
- Mahmoud Khalil Al-Husary and Abdul Basit Abdus-Samad recitations from
  [EveryAyah](https://everyayah.com), with Surah downloads for offline playback.
- Playback ranges, repeat controls, follow-along navigation, and volume control.
- Two translated-speech engines:
  - Four consistent offline Kokoro voices included with every platform build.
  - Selectable Android, Apple, and Windows system voices for faster startup and
    efficient hardware-native speech.
- Translation speech speed selection for both Kokoro and system voices.
- Portable backup and restore for translations, annotations, preferences, and
  downloaded recitations.
- No account, analytics service, application backend, or cloud TTS provider.

## Platform support

| Platform | Development | Release output |
| --- | --- | --- |
| Android | Expo native project | Signed APK |
| iOS | Expo native project on macOS | Build locally or with EAS |
| Windows 10/11 | Expo Web in Electron | NSIS installer |
| Windows 7 | Legacy Electron 22 package | Unsupported compatibility installer |

The Windows 7 build uses an end-of-life Electron runtime and should only be
used where a supported version of Windows is unavailable.

## Getting started

### Prerequisites

- Node.js 22
- npm
- Android Studio and JDK 21 for Android development
- macOS and Xcode for iOS development
- Windows for producing and testing Windows installers

Install the locked dependency set and verify the bundled Quran database:

```sh
npm ci
npm run verify:quran
```

The first native or desktop build downloads the quantized Kokoro model,
verifies its SHA-256 checksum, and stages it under `assets/tts-native/models/`.
You can prepare it explicitly with:

```sh
npm run prepare:tts-model
```

### Run a development build

```sh
# Start the Expo development server
npm start

# Build and run Android
npm run android

# Build and run iOS on macOS
npm run ios

# Start Expo Web and the Electron window
npm run desktop:dev
```

Quran Folio uses custom native modules, so its complete Android and iOS feature
set requires a native development build rather than Expo Go.

## Speech and recitation

Kokoro provides the same four English voices on every platform and runs fully
on-device after installation. Synthesized audio is cached, the engine is warmed
ahead of playback, and upcoming translated Ayahs are prefetched to reduce gaps.

The Device voice option uses speech engines already installed by Android, iOS,
or Windows. Available voices are filtered for the active translation language,
and the selected voice and speech speed are saved in Settings. Installed voice
availability, quality, and offline support depend on the operating system.

Recitation audio is streamed from EveryAyah when it is not available locally.
Download a Surah in the Recitation tab before going offline.

## Windows desktop

The Electron application reuses the Expo Web target and the shared React Native
screens, domain logic, and data layer. The packaged app serves its files from a
loopback-only origin with cross-origin isolation enabled for SQLite's WebAssembly
worker.

```sh
# Unpacked app for local verification
npm run desktop:build

# Current Windows NSIS installer
npm run desktop:package

# Legacy Windows 7 NSIS installer
npm run desktop:package:win7
```

Build outputs are written to `release/` and `release-win7/`. Windows installers
are currently unsigned and may trigger Microsoft SmartScreen warnings.

See [Windows desktop architecture](docs/WINDOWS_DESKTOP.md) for the Electron
security, persistence, and platform-adapter design.

## Verification

Run the main checks before submitting a change:

```sh
npm run typecheck
npm run lint
npm test
npm run verify:quran
```

Maestro flows are kept in `e2e/maestro/` and run separately from Jest.

## Project structure

```text
src/app/                 Expo Router screens and routes
src/components/          Shared UI components
src/features/            Feature domain, data, application, and UI layers
src/platform/            Native and web platform adapters
desktop/                 Electron main process and desktop support
tests/                   Jest unit tests and fixtures
e2e/maestro/             Mobile end-to-end flows
assets/data/             Bundled Quran database
vendor/tanzil/           Verified Quran source material
```

Additional documentation:

- [Translation import format](docs/TRANSLATION_FORMAT.md)
- [Quran data provenance](docs/DATA_PROVENANCE.md)
- [Open-source review](docs/OPEN_SOURCE_REVIEW.md)

## Automated releases

Every push to `main` builds the current Windows installer, the legacy Windows 7
installer, and a signed Android APK, then publishes them to the GitHub release
matching the version in `package.json`. A repeated build of the same version
updates that release.

Configure these GitHub Actions secrets before running the release workflow:

- `ANDROID_KEYSTORE_BASE64`: Base64-encoded Android release `.jks` keystore.
- `ANDROID_KEYSTORE_PASSWORD`: Android keystore password.
- `ANDROID_KEY_ALIAS`: Android signing key alias.
- `ANDROID_KEY_PASSWORD`: Android signing key password.

Back up the Android signing key securely and never commit it to the repository.

## Quran text attribution

Quran Folio includes Tanzil Quran Text (Uthmani, version 1.1), covering 114
Surahs and 6,236 Ayahs, under the Creative Commons Attribution 3.0 license. The
source file and its copyright notice are retained in `vendor/tanzil/`; the app
does not normalize or modify the Arabic text. See
[Quran data provenance](docs/DATA_PROVENANCE.md) for checksums and verification
details.
