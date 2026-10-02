---
id: TASK-177.5
title: 'Image import: repair missing image rows from the original EPUB on open'
status: Done
assignee:
  - claude
created_date: '2026-10-01 18:10'
updated_date: '2026-10-01 18:27'
labels:
  - book-import
  - reader
dependencies:
  - TASK-177.4
modified_files:
  - packages/book-import/src/parsers/epub.ts
  - packages/book-import/src/__tests__/images.test.ts
  - apps/capacitor/src/services/book-import/repair-images.ts
  - apps/capacitor/src/services/book-import/__tests__/repair-images.test.ts
  - apps/capacitor/src/pages/reader/index.tsx
  - agents/capacitor.md
parent_task_id: TASK-177
priority: medium
ordinal: 119000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem

Since TASK-177.4 image rows are written in the background after the book is committed. If the app is killed (or crashes) mid-write, the book keeps its anchors but some or all `book_images` rows never land. The reader renders nothing for those anchors and there is no way to get the pictures back short of deleting and re-importing the book.

## Outcome

- When a book is opened and some of its anchors have no stored image row, and the original EPUB is on disk (`books.filePath`, native only), the missing images are loaded from that file, prepared the same way as at import, and written in the background. Figures appear in the open reader as rows land (same invalidation as the import write).
- Repair runs at most once per book per app session, so images that were legitimately skipped at import (over the size caps, unloadable) do not cost a zip read on every open.
- No text re-parse: images are addressed by their archive path (`key`), so repair touches only the zip entries that are missing.
- Web builds (no original file) and books without `filePath` do nothing.
- Failures are logged and reported to telemetry, never shown as an error.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening a native book whose anchors reference keys without a book_images row, with the original EPUB on disk, writes the missing rows and the figures appear without reopening (verified on the Pixel by deleting rows from the live DB and reopening the book)
- [x] #2 The repair reads only the missing archive entries and never changes content, anchors or existing rows (unit test on the shared package: loading a subset of keys from the image fixture returns exactly those images)
- [x] #3 A book with no missing rows, no filePath, or on the web build triggers no repair work
- [x] #4 Repair runs at most once per book per app session
- [x] #5 Repair failures are logged under book-import and reported to telemetry
- [x] #6 book-import and capacitor unit suites and the reader-images e2e spec pass
- [x] #7 agents/capacitor.md Book Import section documents the repair
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. `packages/book-import/src/parsers/epub.ts`: export `loadEpubImages(buffer, keys, prepare)`: opens the archive with the same `openEpubBook`, runs `ImageStore.load` for each key, returns the loaded `ImportImage[]`, destroys the book. Reuses caps and preparation. Unit test with `imageFixture()`: request two of the three keys, get exactly those.
2. `apps/capacitor/src/services/book-import/repair-images.ts`: pure `missingImageKeys(anchors, storedKeys)`; `repairMissingImages({ id, filePath }, anchors, storedKeys)`: native only, `filePath` required, once per book per session (module `Set`), reads the file via `Filesystem.readFile` + `base64ToArrayBuffer`, calls `loadEpubImages` with `prepareImageOffThread`, writes via `queries.addBookImages` with the same periodic `bookKeys.images` invalidation, logs one line; errors → `log.warn` + `reportEvent("book_images_repair_error")`.
3. `pages/reader/index.tsx`: effect after `book`, `contentRow` and `bookImages` are loaded: `void repairMissingImages(book, anchors, bookImages.map(i => i.key))`.
4. Tests: `repair-images.test.ts` for `missingImageKeys`; package test for `loadEpubImages`.
5. Docs: `agents/capacitor.md`.
6. Device: pull DB, delete half of the book's `book_images` rows, push back (memory procedure), reopen the book, confirm rows return and figures show.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
First device attempt failed: `Filesystem.readFile` on the 4.8 MB original EPUB OOMed natively (`Failed to allocate a 262195304 byte allocation`), the same base64-over-the-bridge problem `sources/read-file.ts` documents. Fixed by `Filesystem.getUri` + `readNativeFile` (fetch via `convertFileSrc`), which reads the bytes straight into the WebView.

Device verification (Pixel 8 Pro): pulled the live DB, deleted 24 of the book's 47 `book_images` rows, pushed it back (force-stop, run-as cat), reopened the book: logcat `repaired 24/24 missing images for 8e78d233`, DB back to 47 rows. Also confirmed the screen-off trap: an adb tap on a locked screen does nothing, wake first.

Review round 3 (fresh conventions + correctness reviewers over 177.3, 177.4, 177.5). Fixed: (1) repair could race the import's background write on the same `(book_id, key)` and both loops aborted on the unique constraint; `addBookImages` now inserts with `onConflictDoNothing` and `repairMissingImages` returns early while `storeBookImages` reports the book as in flight (test added); (2) EXIF-rotated JPEGs were squashed because `createImageBitmap` applied orientation before the header-derived resize; images are now decoded at full size (bounded by `MAX_DECODE_PIXELS`) and scaled on the canvas; (3) an image over the decode cap was stored untouched and would have made the reader decode it on every open; the parser now skips it (test with a crafted 20000x20000 PNG header); (4) transparency is kept as PNG from any source, not only PNG/GIF; (5) worker creation is memoised as a promise so two concurrent parses cannot create two workers; (6) the worker replies `{ id, error }` on failure so a request can never hang; (7) the original-file copy re-checks the book after writing and unlinks the file if the book was deleted meanwhile; (8) `parseAndCommit` (folder scan, catalog) awaits the background work so a batch holds one payload at a time; (9) a zip entry whose declared uncompressed size exceeds the per-image cap is skipped before inflating; (10) the worker imports `prepareImage` from the `utils/image-analysis` subpath so epubjs is not bundled into it; (11) one `storeBookImages` helper replaces the duplicated write/refresh/telemetry loop; constants and types moved next to their siblings, `EXTERNAL_SRC_RE` named, the reader effect depends on `id`/`filePath` only, docs split into parse/prepare/store/repair bullets. Suites: parser 87, capacitor 825, e2e image + import + folder-scan green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Books whose image rows were lost (app killed during the deferred write) repair themselves on open.

- `packages/book-import` `epub.ts`: `loadEpubImages(buffer, keys, prepare)` opens the archive and loads only the named entries through the existing `ImageStore` (same caps and preparation), no text re-parse. `ImageStore.load` made public.
- `apps/capacitor` `repair-images.ts`: `missingImageKeys(anchors, storedKeys)` and `repairMissingImages(book, anchors, storedKeys)`: native only, needs `filePath`, once per book per session; reads the original via `Filesystem.getUri` + `readNativeFile` (fetch, not the base64 bridge), prepares in the worker, writes with `addBookImages`, invalidates `bookKeys.images` every 8 rows and at the end; failures logged and reported as `book_images_repair_error`.
- Reader `index.tsx`: runs the repair once book, anchors and stored metadata are loaded.
- Docs updated.

Verified on the Pixel by deleting 24 rows from the live DB: `repaired 24/24`. Tests: `loadEpubImages` subset test in the package, `missingImageKeys` in the app; parser 86, capacitor import/db/reader suites, reader-images e2e.
<!-- SECTION:FINAL_SUMMARY:END -->
