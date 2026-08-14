---
id: TASK-165.1
title: 'Folder scanner: native SAF walk plus cross-platform folder source'
status: Done
assignee: []
created_date: '2026-08-14 20:14'
updated_date: '2026-08-14 21:58'
labels:
  - import
  - android
  - capacitor
dependencies: []
references:
  - >-
    ../spielfluss/apps/capacitor/android/app/src/main/java/app/spielfluss/RomScannerPlugin.java
  - ../spielfluss/apps/capacitor/src/lib/rom-scanner-plugin.ts
  - apps/capacitor/src/services/book-import/sources/file-picker.ts
documentation:
  - MULTI-IMPORT-SCOPE.md
parent_task_id: TASK-165
priority: medium
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Give the import subsystem a way to obtain a list of book files from a folder the reader picks, on Android and on web, without reading any file contents yet.

`@capacitor/filesystem`'s `readdir` does not accept `content://` URIs, so the Android side needs a small native plugin. `../spielfluss/apps/capacitor/android/app/src/main/java/app/spielfluss/RomScannerPlugin.java` is a working implementation of exactly this walk (`DocumentFile.fromTreeUri()` plus recursion) and should be ported. Drop its SHA-1 fingerprinting: that project needs content hashes for server-side matching, this one does not, and it costs a 1 MB read per file.

Entries cross the bridge as `{ relativePath, name, size, uri, parentName }`. Extension filtering stays in TypeScript so the supported-format list lives in one place.

The web path uses `<input type="file" multiple webkitdirectory>`, which gives a real folder pick on desktop browsers and degrades to multi-file selection on mobile browsers that ignore the attribute.

Both paths converge on one `ScannedFile` shape carrying an opaque handle (SAF document URI on native, held `File` on web) plus a `readScannedFile()` that turns a handle into a `RawInput`. The size cap, fetch timeout, and `Capacitor.convertFileSrc()` read already in `apps/capacitor/src/services/book-import/sources/file-picker.ts` should move into a shared helper rather than being duplicated.

No parsing, no probing, no UI in this subtask.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Picking a folder on Android returns every supported book file inside it, including files nested in subfolders
- [x] #2 Files with unsupported extensions and dotfiles are excluded from the returned list
- [x] #3 A returned handle can be read back into a RawInput on both native and web, honouring the existing import size cap and read timeout
- [x] #4 Cancelling the folder picker surfaces the same CANCELLED signal the single-file picker already uses, and raises no error alert
- [x] #5 The single-file picker still works unchanged after the shared read helper is extracted
- [x] #6 Reading a file whose URI has become unavailable fails for that file alone and reports a distinguishable error
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan

### 1. Format list, single source (`packages/book-import`)

New `src/utils/file-format.ts`:
- `BookFileFormat = "txt" | "md" | "epub" | "html" | "pdf"` — a scan-level format, distinct from `BookPayload["fileFormat"]` (md parses to `txt` there, but the review UI must still badge it MD).
- `bookFormatForFileName(name): BookFileFormat | null` — extension lookup, null for anything unsupported. Exported from the package index.

The `matchers.ts` predicates stay untouched; they key off `RawInput` (bytes + mime) and answer a different question.

### 2. Native scanner (`BookScannerPlugin.java`)

Ported from spielfluss' `RomScannerPlugin`, without the SHA-1 head hashing.
- `listFiles({ uri }) -> { entries: [{ relativePath, name, size, uri, parentName }] }`
- `DocumentFile.fromTreeUri()`, recursive walk, directories recursed, non-files skipped.
- Rejects on a missing uri or a uri that does not resolve to a directory.
- Register in `MainActivity.onCreate` next to the existing two plugins.
- `androidx.documentfile:documentfile:1.0.1` added to `android/app/build.gradle`.

No extension filtering in Java: the walk returns everything, TS filters. Keeps the format list in one place and lets the filter change without a native rebuild.

### 3. Shared read helper (`sources/read-file.ts`)

Extract from `file-picker.ts`, unchanged in behaviour: `MAX_IMPORT_BYTES`, `READ_TIMEOUT_MS`, the abortable `fetch` + `convertFileSrc` read, and the `FileReader` web read. `file-picker.ts` then imports these rather than owning them.

### 4. Folder source (`sources/folder-scan.ts`)

- `ScannedFile = { name, relativePath, size, format, handle }`, handle is `{ kind: "uri", uri }` or `{ kind: "file", file }`.
- `pickBookFolder()`: native runs `FilePicker.pickDirectory()` then `BookScanner.listFiles`; web uses `<input type="file" multiple webkitdirectory>` and maps `webkitRelativePath`. Both filter through `bookFormatForFileName`, drop dotfiles, and sort by relative path.
- `readScannedFile(file)`: handle to `RawInput` via the shared helper, enforcing the same size cap and timeout.
- Cancellation raises `Error("CANCELLED")` on both platforms, matching the single-file picker.

### 5. Exports and tests

`services/book-import/index.ts` re-exports the folder entry points and types.

Tests: `bookFormatForFileName` (every supported extension, case insensitivity, unsupported and extensionless names) and the pure scan filter (dotfiles, unsupported extensions, nested paths preserved, sort order). The native walk itself is only verifiable on a device, which is acceptance criterion 1.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. `pnpm exec tsc --noEmit` clean, 541 capacitor tests + 36 book-import tests pass, `./gradlew :app:compileDebugJavaWithJavac` compiles.

Files: `packages/book-import/src/utils/file-format.ts` (new, exported from package index), `apps/capacitor/android/.../BookScannerPlugin.java` (new), `MainActivity.java` (register), `android/app/build.gradle` (documentfile dep), `services/book-import/sources/read-file.ts` (new, extracted), `sources/file-picker.ts` (uses it), `sources/folder-scan.ts` (new), `services/book-import/index.ts` (exports).

New tests: `__tests__/folder-scan.test.ts` (7 cases over `toScannedFiles`), `packages/book-import/src/__tests__/file-format.test.ts` (4 cases).

Deviations from plan: none. `toScannedFiles` takes a handle factory so both platform paths share one filter/sort, rather than each mapping its own.

Oversized files are deliberately kept in the scan result rather than dropped: `readScannedFile` throws FILE_TOO_LARGE at read time so the batch runner can report them per-file instead of the scan silently losing books.

AC 1, 3, 4, 6 exercise the native picker and SAF walk and can only be confirmed on a device (`pnpm android`). AC 5 is a mechanical extraction with identical constants and read paths, compiling and type-checking, but the picker itself is not covered by an automated test, so it wants the same device pass.

Fresh-context review pass (3 parallel reviewers: conventions, correctness, security; plus an adversarial verify agent). 10 candidate findings, 3 refuted, 7 fixed.

Refuted and deliberately NOT changed:
- Claim that the 300ms focus cancel heuristic misfires for `webkitdirectory` on desktop Chrome. Rests on an unverifiable assertion about whether Chrome delivers window focus before or after its own upload confirmation. The `cancel` event was adopted anyway on design grounds, with the focus heuristic kept as the fallback for older engines.
- Claim that the new JSDoc violates a zero-comment rule. That rule is scoped to the rsvpnano firmware PR, not this repo; house style here is heavy JSDoc on exports (`commit.ts`, `file-picker.ts`).
- Claim that `root.isDirectory()` outside the try bypasses the intended reject. `fromTreeUri` is pure URI arithmetic and `queryForString` swallows SecurityException and returns null, so a stale grant already reaches `call.reject`. Moot now: the walk no longer uses DocumentFile.

Fixed:
1. `file-format.ts` — `EXTENSION_FORMATS` given a null prototype. `bookFormatForFileName("x.constructor")` returned the Object constructor and `"x.__proto__"` returned Object.prototype; `?? null` is nullish-only so both survived the filter with a function where a `BookFileFormat` belongs. Regression test added.
2. `BookScannerPlugin.java` — rewritten off `DocumentFile` onto one `DocumentsContract` cursor per directory. DocumentFile costs 4 provider IPC round-trips per file (name, mime twice, size), verified against the 1.0.1 bytecode; a 5k-book Calibre library is ~60k queries. Now one query per directory.
3. Same file — the walk moved off Capacitor's shared `HandlerThread` onto its own executor. Every plugin call in the app shares that thread, so a long walk stalled Preferences, Filesystem, and sync for its duration.
4. Same file — MAX_DEPTH 8 and MAX_ENTRIES 20000 ceilings, reported to JS as `truncated` rather than applied silently, and `catch (Throwable)` so a heap exhaustion fails the call instead of killing the process. No cycle guard: SAF does not expose symlink loops to a provider client.
5. `pickBookFolder` now returns `FolderScan` (`{ files, truncated }`) so a capped scan cannot look complete.
6. Dead `parentName` removed from the Java walk, `ScanEntry`, the web stub, and the test fixture. It had zero readers and is already the second-to-last segment of `relativePath`.
7. `BOOK_FILE_EXTENSIONS` wired into the web picker's `accept` instead of the hardcoded duplicate. The native branch keeps its own list because that picker filters by mime type, not extension.
8. New `sources/pick-dialog.ts` holds `pickOrCancel` and `openWebFilePicker`, shared by both sources. The cancel heuristic previously existed in two copies and could drift.
9. `toScannedFiles` now takes candidates that already carry their handle, dropping the fabricated `uri: ""` filler and the index-based handle lookup. No misalignment existed, but the implicit "index indexes the input array" contract would have broken silently under a future `.filter()`.
10. `androidx.documentfile` dependency removed, unused after the rewrite.

Re-verified after fixes: tsc clean, 541 capacitor + 37 book-import tests pass, `:app:compileDebugJavaWithJavac` compiles.

Device-verified on a Pixel 8 Pro (debug build, installDebug). Driven over CDP through the WebView's devtools socket (`adb forward` + `Runtime.evaluate`) rather than by adding throwaway UI, so no scaffolding entered the repo.

Fixture pushed to `/sdcard/Download/lesefluss-test`: 9 files over 3 nesting levels, including a dotfile and three unsupported extensions.

AC1: `BookScanner.listFiles` returned all 9 entries with correct relative paths, including the 3-level `Deep/A/B/deep.epub`, correct sizes (5001021 bytes for the real EPUB), and `truncated: false`. Directory recursion confirmed.

AC3: `Capacitor.convertFileSrc(entry.uri)` + `fetch` read the 5 MB EPUB in 211 ms, byte count matching `entry.size` exactly, with an intact `PK` zip magic.

AC6: a document URI pointing at a non-existent child returned HTTP 404 with `res.ok === false`, which is the branch `readNativeFile` maps to `FILE_READ_FAILED`. One file fails alone.

AC4: dismissing the SAF picker rejects with `"pickDirectory canceled."`, which matches the `/cancel/i` test in `pickOrCancel` and becomes `CANCELLED`. Worth knowing for future device runs: the first BACK press navigates within DocumentsUI rather than dismissing it, so a cancel test needs to press until the foreground activity is no longer `com.android.documentsui`.

AC5: exercised the real UI end to end. Clicked "Add book" then "Import file" via the DOM, the native picker opened through the refactored `pickOrCancel` path, and selecting the EPUB produced a confirm sheet populated with "Morning Star" / "Pierce Brown" - real OPF metadata, so the whole pick, read, and parse chain survives the extraction. The staged import was cancelled rather than committed.

Note for TASK-165.3: `window.Capacitor.Plugins.BookScanner` is reachable from the WebView console even with no JS caller, because the plugin is registered natively in MainActivity. Useful for iterating on the scanner without a UI.
<!-- SECTION:NOTES:END -->
