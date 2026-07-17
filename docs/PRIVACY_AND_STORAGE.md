# Privacy and storage

Quran Folio is local-first. The MVP has no account, backend, analytics service,
remote Quran API, or cloud TTS provider.

- `quran-uthmani-v1.1.sqlite` contains only verified Arabic source data and is
  opened query-only.
- `quran-folio-user.sqlite` contains imported translations, annotations, and
  preferences.
- Selected JSON files are copied into the operating-system cache for validation;
  their contents are not uploaded.
- Device speech receives only the active imported translation text. Notes and
  Arabic Quran text are not passed to the speech controller.
- Production diagnostics must not log filenames, imports, translation text, or
  notes.

SQLite files are protected by the normal iOS/Android app sandbox but are not
encrypted against a compromised or unlocked device. Uninstalling the app may
remove all imported translations and annotations. Cloud sync and backup export
are intentionally outside the MVP.
