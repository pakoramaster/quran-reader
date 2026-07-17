# Open-source architecture review

The implementation was informed by, but does not copy source from, these apps:

- [Sakina Quran](https://github.com/mr3od/sakina-quran) — MIT. Useful ideas:
  Expo Router routes, feature-layer separation, SQLite repositories, immutable
  Quran queries, and platform-aware reader architecture.
- [Open Mushaf Native](https://github.com/adelpro/open-mushaf-native) — MIT.
  Useful ideas: offline-first reading, lightweight local UI state, and focused
  reader interactions.

Quran Folio's code and schema were written independently. Any future direct reuse
must be reviewed file by file and retain the source project's MIT notice.
