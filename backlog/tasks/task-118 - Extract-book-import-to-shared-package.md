---
id: TASK-118
title: Extract book-import to shared package
status: Done
assignee:
  - OpenCode
created_date: '2026-05-01 13:44'
updated_date: '2026-05-01 14:13'
labels: []
milestone: m-9
dependencies: []
ordinal: 1700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Lift the book-import pipeline out of `apps/capacitor/src/services/book-import` into a new `packages/book-import` so it can be reused by the server (TASK-B) and the browser extension (TASK-86).

Scope:
- Move pipeline + parsers + utils + `sources/blob` + `sources/url` to the package.
- `runImportPipeline` returns `BookPayload` — drop the commit step. Consumers compose parse + commit themselves.
- Make `parsers/registry.ts` async with dynamic imports per parser, so heavy deps (`epubjs`, `pdfjs-dist`, `@mozilla/readability`) only land in bundles that actually use them.
- Parameterise `CATALOG_URL` (currently imported from `services/catalog/client`) and the pdfjs worker URL — pass via factory or function arg.

Stays in capacitor:
- `commit.ts` (local SQLite + Capacitor Filesystem write).
- `sources/file-picker.ts`, `sources/clipboard.ts`, `sources/share-intent.ts` (Capacitor plugins).
- A thin in-app wrapper that composes parse + commit and exposes the same public API to existing hooks (`useImportBookFromUrl` etc.) so no UI behaviour changes.

No user-visible change. The mobile app must work identically before/after.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New `packages/book-import` exports the pipeline, all parsers, utils, and `sources/{blob,url}`
- [x] #2 `runImportPipeline` returns `BookPayload` and no longer calls `commitBook`
- [x] #3 Parser registry uses dynamic imports so unused parsers are tree-shakable per consumer
- [x] #4 `CATALOG_URL` and pdfjs worker URL are injectable, not hard-imported
- [x] #5 Capacitor wrapper (`apps/capacitor/src/services/book-import/index.ts`) preserves the existing public API used by `useImportBook*` hooks
- [x] #6 All existing capacitor book-import tests still pass; no UI regressions in import flows (file, clipboard, URL, share intent, blob)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Approved implementation plan:

1. Create `packages/book-import` as a shared workspace package with `package.json`, `tsconfig.json`, and `src/index.ts`.
2. Treat "no deps" as no hard app/Capacitor/runtime dependencies: parser libraries (`epubjs`, `pdfjs-dist`, `@mozilla/readability`) are optional peers plus dev dependencies for type-checking; consumers install the parsers they enable.
3. Move shared code into the package: pipeline, shared types, all parsers, parser registry, utils, and `sources/blob` + `sources/url`.
4. Keep Capacitor-only code in the app: `commit.ts`, `sources/file-picker.ts`, `sources/clipboard.ts`, `sources/share-intent.ts`.
5. Change shared `runImportPipeline` to return `BookPayload` only. The Capacitor wrapper composes `source -> runImportPipeline -> commitBook` so existing public APIs still return `Book`.
6. Make parser selection async and tree-shakable: the registry uses cheap filename/mime/text matchers first, then dynamic imports only the matching parser module in the existing parser priority order.
7. Inject environment-specific config: `fetchUrlToRawInput(url, { catalogUrl })`; PDF parser receives an injectable `loadPdfjs` implementation so Vite `?worker` stays in Capacitor.
8. Update app imports to use `@lesefluss/book-import` for shared utilities/types while preserving local imports for Capacitor-only sources and commit.
9. Update project docs (`AGENTS.md`, `agents/capacitor.md`) to reflect the new package split.
10. Verify with the new package typecheck and Capacitor type/test checks; fix regressions without changing user-visible import behavior.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented shared `@lesefluss/book-import` package with parser/source/utils extraction, async dynamic parser registry, injected catalog URL, and injected PDF loader for the Capacitor Vite worker. Capacitor wrapper now preserves existing `importBook*` API by composing shared parse with local `commitBook`. Added package-local Vitest coverage for pipeline payload return, blob source, URL source success/error contract, URL guards, and DOM paragraph extraction. Verification passed: `pnpm --filter @lesefluss/book-import test` (3 files, 7 tests), `pnpm --filter @lesefluss/book-import check-types`, and `pnpm --filter lesefluss check-types` (13 files, 164 tests). Full root `pnpm check-types` was attempted but blocked by pre-existing unrelated Biome findings in reader/library/settings files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary
- Extracted app-neutral book import pipeline, parser registry, parsers, sources, and utilities into the shared `@lesefluss/book-import` workspace package.
- Kept Capacitor-only file picker, clipboard, share intent, SQLite commit, and filesystem persistence in the app while preserving the existing `importBook*` public API used by hooks.
- Added async parser loading with shared lightweight matchers, injectable catalog URL/PDF loader configuration, and package-local Vitest coverage for pipeline, sources, URL guards, and DOM paragraph extraction.
- Tightened review findings by removing dead app compatibility stubs, deduplicating parser matching logic, validating injected catalog URLs, and avoiding broad root exports of PDF internals.

## Verification
- `pnpm --filter @lesefluss/book-import test` passed: 3 files, 7 tests.
- `pnpm --filter @lesefluss/book-import check-types` passed.
- `pnpm --filter lesefluss check-types` passed: Capacitor typecheck plus 13 test files / 164 tests.
- Root `pnpm check-types` was attempted but remains blocked by pre-existing unrelated Biome findings outside this refactor scope.
<!-- SECTION:FINAL_SUMMARY:END -->
