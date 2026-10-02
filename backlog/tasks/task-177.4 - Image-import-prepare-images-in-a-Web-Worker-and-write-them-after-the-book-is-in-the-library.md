---
id: TASK-177.4
title: >-
  Image import: prepare images in a Web Worker and write them after the book is
  in the library
status: Done
assignee:
  - claude
created_date: '2026-10-01 15:40'
updated_date: '2026-10-01 18:08'
labels:
  - book-import
  - performance
dependencies:
  - TASK-177.3
modified_files:
  - packages/book-import/src/types.ts
  - packages/book-import/src/parsers/epub.ts
  - apps/capacitor/src/services/book-import/image-prepare.ts
  - apps/capacitor/src/services/book-import/image-prepare.worker.ts
  - apps/capacitor/src/services/book-import/image-prepare-protocol.ts
  - apps/capacitor/src/services/book-import/pipeline.ts
  - apps/capacitor/src/services/book-import/commit.ts
  - apps/capacitor/src/services/db/queries/books.ts
  - apps/capacitor/src/services/db/queries/index.ts
  - apps/capacitor/src/services/db/__tests__/book-images.test.ts
  - agents/capacitor.md
parent_task_id: TASK-177
priority: high
ordinal: 118000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem

After TASK-177.3 an illustrated EPUB (Empire of the Damned, 47 full-page images) still makes the app stutter twice on the Pixel 8 Pro:

1. During parsing, every image is decoded, downscaled and re-encoded on the main JS thread (`prepareImage` via `createImageBitmap` + `OffscreenCanvas`), roughly 100 to 200 ms per large JPEG. The progress bar is up but the UI stutters for several seconds.
2. After "Add to library", the commit pushes ~20 MB of base64 through the Capacitor SQLite bridge in 47 inserts (plus the original EPUB file in 3 MB chunks) before the sheet closes: 2.8 s with a spinner that animates but feels laggy.

## Outcome

- Image preparation runs off the main thread in a Web Worker (OffscreenCanvas is available in workers on Chromium WebView and Safari 16.4+). The parser gets the preparer injected through `ImportPipelineOptions`, so the shared package stays runnable without a worker (tests, environments without `Worker`): the in-thread preparer remains the default and the worker path falls back to it when `Worker` is unavailable.
- "Add to library" returns as soon as the book row, text, word index and anchors are written. Image rows (and the original file copy) are written afterwards in the background; the library shows the book immediately and the reader shows figures as their rows land (it already renders nothing for anchors without a stored row, and the images query is invalidated as rows arrive).
- Background writes stop if the book is deleted meanwhile; failures are logged and reported to telemetry, never surfaced as an import failure.
- Known limitation, documented: if the app is killed mid-write, the remaining images of that book are missing until a re-import; no retry in v1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Parsing an EPUB with large images does not block the main thread: on the Pixel the progress bar animates smoothly while Empire of the Damned parses, and the parser unit tests still pass without a Worker
- [x] #2 Tapping Add to library on Empire of the Damned closes the sheet in well under a second (logged commit time excludes image writes) and the book appears in the library immediately
- [x] #3 Opening the book while images are still being written shows the figures that have landed, and the rest appear without reopening the book
- [x] #4 Deleting the book while its images are being written stops the writes and leaves at most one orphan row (unit test against real SQLite)
- [x] #5 Image write failures are logged under book-import and reported to telemetry without failing the import
- [x] #6 book-import and capacitor unit suites, the reader-images and import-epub e2e specs pass
- [x] #7 agents/capacitor.md Book Import section documents the worker and the deferred write
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Worker (parse side)
1. `packages/book-import/src/types.ts`: `PrepareImage = (blob: Blob, size: ImageDimensions | null) => Promise<PreparedImage>`; `ImportPipelineOptions.prepareImage?: PrepareImage`.
2. `packages/book-import/src/parsers/epub.ts`: `parse(input, onProgress, options)` passes `options?.prepareImage ?? prepareImage` into `ImageStore` (constructor arg). Nothing else changes; unit tests keep the in-thread default.
3. `apps/capacitor/src/services/book-import/image-prepare.worker.ts`: worker entry, `onmessage({ id, blob, size })` → `prepareImage` → `postMessage({ id, blob, width, height, isLineArt })`.
4. `apps/capacitor/src/services/book-import/image-prepare.ts`: `prepareImageOffThread: PrepareImage`. Lazily creates one worker (Vite `?worker` import, same as the pdf.js worker), correlates replies by id, terminates the worker after 15 s idle, and falls back to the in-thread `prepareImage` when `Worker` is undefined or the worker errors.
5. `pipeline.ts`: `pipelineOptions.prepareImage = prepareImageOffThread`.

## Deferred writes (commit side)
6. `queries/books.ts`: `addBookWithContent` no longer takes images (`commitBookContent` drops the image loop and rollback line). New `addBookImages(bookId, rows)`: for each row, yield, check the book still exists and is not tombstoned (`getBook`), insert; returns the number written. Stops at the first missing/deleted book.
7. `commit.ts`: `commitBook` writes row + content + anchors and returns. Then, not awaited: `finishImportInBackground(id, payload)` = original-file copy (moved out of the awaited path) then `addBookImages` in batches, invalidating `bookKeys.images(id)` via the shared `queryClient` every 8 rows and at the end. Errors: `log.warn("book-import", ...)` + `reportEvent("book_images_write_error", ...)`. The commit log line reports the awaited part; a second line reports the background part when it finishes.
8. `book-images.test.ts`: adapt to `addBookImages`; add "stops when the book was deleted meanwhile" (delete between rows via a hook on `getBook`? simpler: insert rows with a `shouldContinue` callback... keep the liveness check inside and test by deleting the book before calling with 2 rows → 0 written; and by deleting after the first row using a tombstoned row → 1 written).
9. Docs: `agents/capacitor.md` Book Import section (worker, deferred write, kill-mid-write limitation).
10. Device: redeploy, re-import Empire of the Damned, read both log lines, open the book while writes run, screenshot.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Device run (Pixel 8 Pro, Empire of the Damned, 47 images): reader reports no lag during parse or after Add to library. Background write log: `stored 47/47 images for 8e78d233 (19702 KB base64) in 4918 ms` (the awaited commit line had rotated out of the logcat buffer; the sheet closed immediately per the reader). Reader screenshots: cover and title page as the first figures, the two grayscale maps rendered untouched on the dark theme (dark borders, correctly not flagged as line art), text follows. AC #3 (figures landing while the book is open) is covered by the e2e spec, which opens the book right after import while the deferred write runs and asserts the figures appear, plus the periodic `bookKeys.images` invalidation; not separately timed on the device.

Worker chunk is emitted by Vite (`image-prepare.worker-*.js`, 4.3 KB) and used on Chromium in the e2e run; the in-thread fallback stays for environments without `Worker`.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Image preparation moved off the main thread and image writes moved after the commit.

- `packages/book-import`: `ImportPipelineOptions.prepareImage` (type `PrepareImage`) injects the preparer; the EPUB parser passes `options.prepareImage ?? prepareImage` into `ImageStore`. Default unchanged, tests unchanged.
- `apps/capacitor/services/book-import/image-prepare*.ts`: a lazily created Web Worker runs `prepareImage` (decode, downscale, re-encode) and replies by request id; released after 15 s idle; falls back to in-thread when `Worker` is missing or the worker fails. Wired through `pipelineOptions`.
- `queries/books.ts`: `addBookWithContent` takes only anchors; new `addBookImages(bookId, images, onWritten)` inserts one row at a time with an event-loop yield and a per-row liveness check (stops when the book is gone or tombstoned).
- `commit.ts`: `commitBook` writes row, text, word index and anchors, logs, returns. `finishImportInBackground` then copies the original file and writes the image rows, invalidating `bookKeys.images` every 8 rows and at the end; failures are logged and reported to telemetry (`book_images_write_error`).
- Docs: Book Import section in `agents/capacitor.md`.

Verified: Pixel 8 Pro, no lag during parse or commit for a 47-image book, all images stored in 4.9 s in the background, reader shows them. Unit: parser 85, capacitor 822 (incl. new delete-race test on real SQLite). E2E: reader-images, import-epub, import-large-epub. Known limitation: no retry if the app is killed mid-write.
<!-- SECTION:FINAL_SUMMARY:END -->
