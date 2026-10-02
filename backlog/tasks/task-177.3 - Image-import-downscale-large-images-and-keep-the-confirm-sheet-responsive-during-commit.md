---
id: TASK-177.3
title: >-
  Image import: downscale large images and keep the confirm sheet responsive
  during commit
status: Done
assignee:
  - claude
created_date: '2026-10-01 15:30'
updated_date: '2026-10-01 15:39'
labels:
  - book-import
  - performance
dependencies: []
modified_files:
  - packages/book-import/src/utils/image-analysis.ts
  - packages/book-import/src/parsers/epub.ts
  - packages/book-import/src/__tests__/image-analysis.test.ts
  - apps/capacitor/src/services/db/queries/books.ts
  - apps/capacitor/src/services/book-import/commit.ts
  - apps/capacitor/src/pages/library/book-edit-sheet.tsx
parent_task_id: TASK-177
priority: high
ordinal: 117000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem (observed on the Pixel 8 Pro, debug build with TASK-177.1/177.2)

Importing "Empire of the Damned" (33 full-page illustrations, 1590×2400 JPEGs of 3 to 5 MB each) froze the app for about 10 s after tapping "Add to library". The confirm sheet's spinner (`isSaving`) exists but could not animate: the JS thread was busy pushing 89 MB of base64 through the Capacitor SQLite bridge, one `INSERT` per image, each carrying a 3 to 5 MB string. The resulting `leseflussSQLite.db` is 89 MB for one book.

Measured from the device DB: 33 rows in `book_images`, 88,977,172 base64 chars, largest row 4,769,836 chars (2100×1585 JPEG).

## Outcome

- Images are stored at a size that matches phone screens: longest side capped (1600 px) and re-encoded at import, so an illustrated novel costs a few MB, not tens. Line art / transparent images keep a lossless format; photos become JPEG. If re-encoding is unavailable (no canvas) or fails, the original is kept, still subject to the existing per-image and per-book caps.
- Tapping "Add to library" shows a live spinner for the whole write and the sheet stays responsive; the library updates when the write is done.
- Commit timing (content, word index, images count and ms) is logged under the `book-import` namespace so slow imports can be diagnosed from logcat.
- Existing books are untouched; the reader needs no change (it reads width/height from the row).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Re-importing Empire of the Damned on the Pixel stores under 15 MB of image data for its 33 images and the DB grows by less than 20 MB
- [x] #2 A 1590x2400 JPEG is stored with its longest side at most 1600 px and width/height in the row match the stored image
- [x] #3 A PNG with transparency or flagged as line art is stored lossless (PNG), not JPEG
- [x] #4 When canvas APIs are unavailable the original bytes are stored unchanged (unit test under happy-dom)
- [x] #5 During the commit the Add to library button shows an animated spinner and the sheet does not appear frozen on the device
- [x] #6 Commit timings appear in logcat as one book-import log line
- [x] #7 book-import and capacitor unit suites, the reader-images e2e spec and the import-epub e2e spec pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. `packages/book-import/src/utils/image-analysis.ts`: `prepareImage(blob, sniffedSize)` decodes once with `createImageBitmap(blob, { resizeWidth/Height })` so the longest side is at most `MAX_STORED_SIDE = 1600` (no resize when already smaller), draws a `SAMPLE_GRID` thumbnail for `classifyLineArt` plus an alpha check from the same pixels, then encodes via `OffscreenCanvas.convertToBlob`: PNG when the source is PNG/GIF and has transparency or is line art, else JPEG at quality 0.82. Keeps the original when the re-encode is not smaller, when the image was already small (no downscale and under 1 MB), or when any API is missing (happy-dom path: original bytes, `isLineArt = false`). Returns `{ blob, width, height, isLineArt }`. `detectLineArt` folds into this (one decode instead of two).
2. `packages/book-import/src/parsers/epub.ts` `ImageStore.loadUncached`: sniff → `prepareImage` → data URL from the returned blob, width/height from the returned size, mime from the returned blob type. Per-image / per-book caps apply to the stored (prepared) size.
3. `apps/capacitor/src/services/db/queries/books.ts` `commitBookContent`: yield to the event loop (`await new Promise(r => setTimeout(r, 0))`) before each image insert so the sheet's spinner keeps animating while the bridge works.
4. `apps/capacitor/src/services/book-import/commit.ts`: one `log("book-import", ...)` line with content/word-index/images counts and total commit ms.
5. `book-edit-sheet.tsx`: the save button shows a spinner icon while `isSaving` (if it does not already).
6. Tests: `image-analysis.test.ts` for the no-canvas path (original returned unchanged) and the format choice logic (pure helper); existing suites. Device: redeploy, re-import Empire of the Damned, pull DB, compare sizes, screenshot the sheet mid-commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Device result (Pixel 8 Pro, Empire of the Damned re-import): 47 images stored (previously 33, the 64 MB budget had cut 14), 19.7 MB base64 = 14.8 MB bytes (previously 89 MB), largest row 1.1 MB (map 1600x1210), commit 2815 ms (previously ~10 s), logcat line `[Lesefluss][book-import] committed 5d6a51f7: 1421053 bytes, 47 images (19702 KB base64) in 2815 ms`. Spinner visible and animating; reader reports the sheet still feels laggy during the write. The DB file stays 89 MB after deleting the old copy: SQLite reuses freed pages, it does not shrink.

Remaining cost split: parse now decodes/downscales/re-encodes every image on the main thread (~100-200 ms per large JPEG, UI stutters); commit pushes ~20 MB base64 through the bridge in 47 inserts (~2 s). Both addressed in the follow-up TASK-177.4 (worker + deferred image writes).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Large EPUB images are now downscaled and re-encoded at import, and the confirm sheet stays alive during the write.

- `image-analysis.ts`: `prepareImage(blob, size)` decodes once with `createImageBitmap` resized to a 1600 px longest side (`fitWithin`), classifies line art and transparency from a 64x64 sample, and re-encodes via `OffscreenCanvas.convertToBlob`: PNG for lossless sources with transparency or line art, JPEG q0.82 otherwise. Small images that need no downscale stay untouched; a re-encode that is not smaller is discarded; missing APIs or decode failures return the original bytes. Replaces `detectLineArt` (one decode instead of two).
- `epub.ts` `ImageStore`: stores the prepared blob; budgets apply to stored size.
- `books.ts`: yields to the event loop before each image insert so the spinner paints.
- `commit.ts`: one `book-import` log line with bytes, image count, base64 KB and ms.
- `book-edit-sheet.tsx`: spinner icon on the save button while `isSaving`.

Verified on the Pixel: 89 MB → 19.7 MB base64 for the same book, ~10 s → 2.8 s commit, all 47 images kept. Tests: `fitWithin`, `storedImageType`, no-canvas `prepareImage` path; parser, db and import suites; image + import e2e specs.
<!-- SECTION:FINAL_SUMMARY:END -->
