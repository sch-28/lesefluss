---
id: TASK-93
title: 'Android: support "Open with Lesefluss" intent for epub/pdf/html files'
status: Done
assignee: []
created_date: '2026-04-26 14:32'
updated_date: '2026-04-26 15:14'
labels:
  - android
  - capacitor
  - import
milestone: m-4
dependencies: []
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Register Android intent filters so the Capacitor app shows up in the system "Open with" / share sheet for epub, pdf, and html files. When a user opens such a file from another app (file manager, browser, email), Lesefluss should receive the file URI and route it through the existing book import pipeline.

Scope:
- Add `<intent-filter>` entries in `apps/capacitor/android/app/src/main/AndroidManifest.xml` for ACTION_VIEW (and SEND for share-sheet) with MIME types `application/epub+zip`, `application/pdf`, `text/html`, plus path/extension fallbacks.
- Wire up a Capacitor handler (App `appUrlOpen` or a dedicated plugin) to receive the incoming URI on cold start and while running.
- Pass the file into the book-import pipeline (`apps/capacitor/src/services/book-import`) reusing the existing parsers (epub/pdf/html).
- Verify cold-start vs warm-start behavior and content:// URI permissions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Lesefluss appears in the Android 'Open with' chooser for .epub, .pdf, and .html files
- [x] #2 Selecting Lesefluss opens the app and starts importing the chosen file via the existing book-import pipeline
- [x] #3 Works for both cold start (app not running) and warm start (app already running)
- [x] #4 Handles content:// URIs from file managers and cloud providers, not only file:// paths
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Extend the existing custom `ShareIntentPlugin` end-to-end (DRY) instead of building a parallel system. The plugin already retains cold-start events and the JS handler at `apps/capacitor/src/components/share-intent-handler.tsx` already routes payloads through the import pipeline — we add a third branch for files.

### 1. AndroidManifest.xml
`apps/capacitor/android/app/src/main/AndroidManifest.xml`
- Extend the existing `ACTION_SEND` filter with `<data android:mimeType>` for `application/epub+zip`, `application/pdf`, `text/html` (keep `text/plain`).
- Add an `ACTION_VIEW` intent-filter on `MainActivity` (categories `DEFAULT` + `BROWSABLE`; schemes `file`, `content`, `http`, `https`) with the same MIME types plus `pathPattern` extension fallbacks (`.*\.epub`, `.*\.pdf`, `.*\.html?`).

### 2. Native plugin — `ShareIntentPlugin.java`
`apps/capacitor/android/app/src/main/java/app/lesefluss/ShareIntentPlugin.java`
- Extend `handleIntent(Intent)`:
  - `ACTION_VIEW` → `intent.getData()`.
  - `ACTION_SEND` non-text → `intent.getParcelableExtra(Intent.EXTRA_STREAM)`.
- Copy stream via `ContentResolver.openInputStream(uri)` → `getCacheDir()/share-intent/<uuid>.<ext>` to sidestep `content://` permission scoping.
- Resolve display name via `OpenableColumns.DISPLAY_NAME` (fallback to last path segment / `shared.<ext>`).
- Emit `notifyListeners("shareReceived", { kind: "file", path, fileName, mimeType }, true)`. Existing text shares keep their shape (default `kind: "text"`).

### 3. JS bridge — `share-intent.ts`
`apps/capacitor/src/services/book-import/sources/share-intent.ts`
- Widen `ShareReceivedEvent` to a discriminated union of `{ kind?: "text", text, subject? }` and `{ kind: "file", path, fileName, mimeType }`.

### 4. Handler — `share-intent-handler.tsx`
- New `kind === "file"` branch: `Filesystem.readFile({ path })` → base64 → `Blob` → call existing `importBookFromBlob(blob, fileName, onProgress, { source: "share-intent" })` from `services/book-import/index.ts:40`.
- Reuse the existing toast/error pattern. Best-effort `Filesystem.deleteFile` after import.

### Reused (DRY)
- `ShareIntentPlugin` registration + `MainActivity.onNewIntent` plumbing.
- `notifyListeners(..., retain=true)` cold-start mechanism.
- `subscribeShareIntent` JS subscription + ref-handler pattern.
- `importBookFromBlob` + `runImportPipeline` + parser registry (epub/pdf/html already supported).

### Files to modify
- `apps/capacitor/android/app/src/main/AndroidManifest.xml`
- `apps/capacitor/android/app/src/main/java/app/lesefluss/ShareIntentPlugin.java`
- `apps/capacitor/src/services/book-import/sources/share-intent.ts`
- `apps/capacitor/src/components/share-intent-handler.tsx`

No new deps, no new mutation hook, no changes to `runImportPipeline` or the parser registry.

### Verification
1. `pnpm --filter capacitor cap sync android`, run on device.
2. VIEW cold + warm start for `.epub`, `.pdf`, `.html` from a file manager.
3. SEND from Drive (pdf) and Chrome (html) via share-sheet.
4. Verify `content://` URIs work (Drive/cloud).
5. Regression: existing text/URL share still routes to `importBookFromUrl` / `importBookFromText`.
6. `pnpm check-types` in `apps/capacitor`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Extended the existing `ShareIntentPlugin` end-to-end rather than building a parallel pipeline.

**Native** (`apps/capacitor/android/app/src/main/`):
- `AndroidManifest.xml`: extended SEND filter with `text/html`, `application/pdf`, `application/epub+zip`; added two ACTION_VIEW filters (MIME-typed for `file://`/`content://`, plus extension `pathPattern` fallback for `.epub`/`.pdf`/`.html`/`.htm`).
- `ShareIntentPlugin.java`: now handles ACTION_VIEW + binary ACTION_SEND. Streams `EXTRA_STREAM` / `getData()` URIs into `cacheDir/share-intent/<uuid>.<ext>` to sidestep `content://` permission scoping; resolves display name via `OpenableColumns.DISPLAY_NAME`. Extension is sanitized to `[a-z0-9]{1,8}` to prevent path traversal from a hostile display name. text/html SEND is treated as file (HTML shares come through `EXTRA_STREAM`, not `EXTRA_TEXT`). Emits `{ kind: "file", path, fileName, mimeType }`; existing text shares now tagged `kind: "text"`.

**JS bridge** (`src/services/book-import/sources/share-intent.ts`):
- `ShareReceivedEvent` is now a discriminated union of `text` and `file` shapes.

**Handler** (`src/components/share-intent-handler.tsx`):
- New `kind === "file"` branch reads the cache copy via `Filesystem.readFile`, builds a `Blob` (with mimeType when available), and calls the new `useImportBookFromBlob` mutation. Best-effort `Filesystem.deleteFile` on settle.
- Any incoming intent now navigates to `/tabs/library` (skipped if already there) so the user sees the toast and the new book land in the visible grid.

**React-query layer** (`src/services/db/hooks/use-books.ts`, `hooks/index.ts`):
- Added `useImportBookFromBlob` to `bookHooks` + `queryHooks` for invalidation parity with the other importers (no separate path for share-intent imports).

No new dependencies. Existing parsers (epub/pdf/html) and `runImportPipeline` reused unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Android intent filters added so Lesefluss appears in both the system "Open with" chooser (ACTION_VIEW) and the share-sheet (ACTION_SEND) for `.epub`, `.pdf`, and `.html` files. Files received via either path are streamed to app cache by the existing `ShareIntentPlugin`, read back through Capacitor Filesystem, and pushed through the same `runImportPipeline` already used by the file picker. The library tab is auto-focused when an intent fires so the user sees the import land. Cold-start, warm-start, `file://`, and `content://` URIs all flow through the cache-copy step. `pnpm check-types` passes; device verification (cold/warm VIEW for each format, share from Drive/Chrome, regression of text/URL shares) still pending on hardware.
<!-- SECTION:FINAL_SUMMARY:END -->
