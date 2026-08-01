# Repository Guidelines

## Project Structure & Module Organization

Quran Folio is an Expo/React Native application with an Electron Windows shell. Routes live in `src/app/`; reusable UI is in `src/components/`. Feature code is grouped under `src/features/<feature>/` by `domain`, `data`, `application`, and `ui`. Shared persistence belongs in `src/data`; native/web implementations use paired files under `src/platform`, such as `dialogs.ts` and `dialogs.web.ts`. Electron code is in `desktop/`. Unit tests are in `tests/unit`, fixtures in `tests/fixtures`, and Maestro flows in `e2e/maestro`. Quran data is under `assets/data`, with sources in `vendor/tanzil`.

## Build, Test, and Development Commands

- `npm ci`: install the locked dependency set (Node 22 is used in CI).
- `npm start`: start Expo; use `npm run android`, `npm run ios`, or `npm run web` for a target.
- `npm run desktop:dev`: launch the Expo web target in Electron.
- `npm run typecheck`: run strict TypeScript checks without emitting files.
- `npm run lint`: apply the Expo ESLint configuration.
- `npm test`: run Jest serially; `npm run test:watch` supports local iteration.
- `npm run verify:quran`: validate the bundled Quran database.
- `npm run desktop:build`: create an unpacked Windows build.

## Coding Style & Naming Conventions

Write TypeScript/TSX with two-space indentation, single quotes, semicolons, and trailing commas. Keep strict typing intact. Use `PascalCase` for components and types, `camelCase` for functions and variables, and `use...` for hooks. Prefer the `@/` alias for `src` imports. Preserve feature layers and the `.web.ts(x)` platform convention. Run Prettier and ESLint before submitting.

## Testing Guidelines

Jest uses `jest-expo`, React Native Testing Library, and shared setup in `tests/setup.ts`. Name tests `*.test.ts` or `*.test.tsx` after the subject, such as `translationFormat.test.ts`. Add focused coverage for domain rules, repositories, migrations, and platform adapters. Before a PR, run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run verify:quran`. Maestro flows run separately from Jest.

## Commit & Pull Request Guidelines

History uses short, imperative summaries such as `tweaked tts` and `added the requested recitation feature`. Keep each commit focused, use a clearer imperative subject when possible, and explain data migrations or platform tradeoffs in the body. PRs should describe behavior, list verification commands and affected platforms, link related issues, and include screenshots or recordings for UI changes. Never commit signing keys or secrets; configure Android credentials through GitHub Actions secrets as documented in `README.md`.
