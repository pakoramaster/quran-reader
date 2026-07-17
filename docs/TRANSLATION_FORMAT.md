# Quran Folio translation JSON v1

Imports are local, immutable reference copies. A translation must be UTF-8 JSON,
no larger than 10 MB, and contain each of the canonical 6,236 Ayah keys exactly
once.

```json
{
  "format": "quran-translation",
  "version": 1,
  "id": "example-en-author-2026",
  "title": "Example English Translation",
  "language": "en",
  "translator": "Translator Name",
  "source": {
    "name": "Publisher or private manuscript",
    "url": "https://example.com/source"
  },
  "license": {
    "name": "User-provided / private use",
    "url": null
  },
  "verses": [
    { "key": "1:1", "text": "Translation text" },
    { "key": "1:2", "text": "Translation text" }
  ]
}
```

## Rules

- `id` is a stable lowercase slug of at most 64 characters.
- `language` is a BCP-47-style tag such as `en`, `fr-CA`, or `ur`.
- `source` and `license` are declarations supplied by the user. Quran Folio does
  not verify redistribution rights.
- `verses` uses an array so duplicate keys can be detected before JSON values
  reach SQLite.
- Keys must use `surah:ayah`, for example `2:255`.
- Text must be non-empty and no individual verse may exceed 20,000 characters.
- Re-importing the same `id` shows a changed-verse count and requires explicit
  confirmation. Replacement is transactional, while notes and highlights remain
  attached to the stable translation ID and verse key.
