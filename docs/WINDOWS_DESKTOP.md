# Windows desktop architecture

Quran Folio packages the Expo Web output in a sandboxed Electron window. The
application screens, domain logic, repositories, migrations, and data remain
shared with Android and iOS.

## Runtime boundary

The `desktop/` directory owns the Electron main process:

- `main.cjs` manages lifecycle, single-instance behavior, and startup errors.
- `staticServer.cjs` serves the exported Expo app from a loopback-only origin.
- `window.cjs` creates the sandboxed renderer and enforces navigation policy.
- `testing/smoke.cjs` contains development diagnostics and is not packaged.

The renderer has no Node.js integration. External HTTP(S) links open in the
system browser; other cross-origin navigation is blocked.

## Stable storage origin

Expo SQLite uses browser storage on web, so its persistence is scoped to the
origin. Production always uses `http://127.0.0.1:47831`; changing this port
would make existing browser-backed databases appear unavailable. The static
server enables the COOP and COEP headers required by the SQLite WebAssembly
worker and `SharedArrayBuffer`.

If the port is occupied, startup stops with a clear error rather than choosing
a different origin and silently presenting an empty library.

## Shared platform capabilities

All renderer-side runtime differences live under `src/platform/`:

- `database/`: native exclusive versus web-supported atomic transactions.
- `dialogs/`: React Native alerts versus browser confirmation dialogs.
- `documents/`: native file URI reading versus browser `File` reading.
- `ui/`: native React Native controls versus browser modal and text controls.

Consumers always import extensionless capability paths. Metro selects `.web`
implementations for Electron and Expo Web. Feature code must not import
Electron or detect web directly.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run web:build
npm run desktop:build
npm run desktop:package
```

Desktop regression tests cover server isolation headers, routing, traversal,
window sandbox settings, external navigation, file reading, transactions,
dialogs, and browser text-style normalization.
