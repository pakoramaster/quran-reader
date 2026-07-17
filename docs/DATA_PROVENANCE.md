# Quran data provenance

The app bundles **Tanzil Quran Text (Uthmani, Version 1.1)** as a physically
separate SQLite database. The source XML was downloaded from Tanzil's official
download endpoint on 2026-07-16.

- Source: https://tanzil.net
- Updates: https://tanzil.net/docs/text_updates
- Source SHA-256: `203f0f1bf3158b1e5be4ab9f8f6870e570aab6d9a626fe6192a70b75d4afe0fd`
- Source coverage: 114 Surahs and 6,236 Ayahs
- License: Creative Commons Attribution 3.0

The original XML and its complete copyright block are retained at
`vendor/tanzil/quran-uthmani-v1.1.xml`. The generator checks its fixed checksum
before writing `assets/data/quran.sqlite`. The application opens the generated
database with `PRAGMA query_only = ON` and exposes it through a repository with
read operations only.

Run the independent checks with:

```sh
npm run build:quran
npm run verify:quran
```

The Arabic text must not be normalized, edited, augmented, or moved into the
mutable user database.
