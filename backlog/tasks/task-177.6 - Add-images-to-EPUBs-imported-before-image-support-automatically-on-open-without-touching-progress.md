---
id: TASK-177.6
title: >-
  Add images to EPUBs imported before image support, automatically on open,
  without touching progress
status: Done
assignee:
  - claude
created_date: '2026-10-01 19:04'
updated_date: '2026-10-01 19:20'
labels:
  - book-import
  - reader
dependencies:
  - TASK-177.5
modified_files:
  - apps/capacitor/src/services/book-import/upgrade-images.ts
  - apps/capacitor/src/services/book-import/__tests__/upgrade-images.test.ts
  - apps/capacitor/src/services/book-import/sources/read-file.ts
  - apps/capacitor/src/services/book-import/repair-images.ts
  - apps/capacitor/src/services/book-import/commit.ts
  - apps/capacitor/src/services/db/queries/books.ts
  - apps/capacitor/src/services/db/queries/index.ts
  - apps/capacitor/src/services/db/schema.ts
  - apps/capacitor/src/services/db/__tests__/book-images.test.ts
  - apps/capacitor/src/pages/reader/index.tsx
  - agents/capacitor.md
parent_task_id: TASK-177
priority: medium
ordinal: 120000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem

Books imported before TASK-177 have no `book_content.image_anchors` and no `book_images` rows. Re-importing would create a new book and lose position, sessions, highlights and glossary. Readers expect their existing illustrated EPUBs to gain pictures after the update.

## Outcome

- On open, an EPUB with its original file on disk (native, `books.filePath`) and no anchors yet is re-parsed in the background. If the parser's text is byte-identical to the stored `content` (the invariant the image feature kept), the new anchors are converted on the existing word index and written to `image_anchors`, and the images are prepared (worker) and stored (background write, same path as import). The book's text, word index, position, sessions, highlights and sync state are untouched; `books.updated_at` does not move.
- If the text differs (older parser output), nothing is changed and the book is marked as checked so it is not re-parsed again; a log line says why.
- A book that was checked and has no images is marked as checked too (empty anchor list), so the re-parse happens once per book, not once per open.
- The upgrade waits a few seconds after the reader opens so the initial render and scroll are not disturbed, and runs at most once per book per session.
- Web builds and non-EPUB formats do nothing. Failures are logged and reported to telemetry.
- This is a transition aid: once libraries have been through it, the automatic upgrade can be removed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening an EPUB on the Pixel whose image_anchors is NULL and whose original file is on disk writes the anchors and image rows in the background, and the figures appear in the open reader; position and sessions are unchanged (verified by clearing anchors and rows of an imported book in the live DB)
- [x] #2 A book whose re-parsed text differs from the stored content is left without images, marked as checked, and a book-import log line names the mismatch
- [x] #3 A checked book (anchors not NULL, including an empty list) is not re-parsed on later opens
- [x] #4 books.updated_at and the sync payload are not affected by the upgrade
- [x] #5 Non-EPUB books, books without filePath, and the web build never start an upgrade
- [x] #6 Unit tests cover the anchor write (real SQLite) and the decision logic; parser, capacitor suites and the reader-images e2e spec pass
- [x] #7 agents/capacitor.md documents the upgrade and that it can be dropped later
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. `queries/books.ts`: `setBookImageAnchors(bookId, anchors: ImportImageAnchor[], wi: WordIndex)` converts with the existing `firstWordAtOrAfter` and writes `image_anchors` (an empty list writes `[]`, the "checked" marker). Touches `book_content` only, never `books.updated_at`. Exported via `queries`.
2. `services/book-import/upgrade-images.ts`: `needsImageUpgrade({ fileFormat, filePath }, imageAnchorsColumn)` (pure: native, epub, filePath, column NULL) and `upgradeBookImages({ id, filePath }, content, wordIndex)`: once per book per session; reads the original with `Filesystem.getUri` + `readNativeFile`, runs `runImportPipeline` with the app's `pipelineOptions` (worker preparer), compares `payload.content === content`; mismatch → `setBookImageAnchors(id, [], wi)` + warn; match → `setBookImageAnchors(id, payload.imageAnchors ?? [], wi)`, invalidate `bookKeys.content(id)`, then `storeBookImages(id, payload.images ?? [], "book_images_upgrade_error")`; errors → warn + `reportEvent("book_images_upgrade_error")`.
3. `pages/reader/index.tsx`: effect with a 3 s timer after `book`, `contentRow`, `wordIndex` are loaded, gated by `needsImageUpgrade`; cleared on unmount.
4. Tests: `book-images.test.ts` for `setBookImageAnchors` (conversion, `[]` marker, `updated_at` unchanged); `upgrade-images.test.ts` for `needsImageUpgrade`.
5. Docs: `agents/capacitor.md` (transition aid, removable later).
6. Device: set `image_anchors = NULL` and delete the rows of the imported book in the live DB, reopen, confirm log + rows + figures and that `word_position` / `updated_at` are unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Device verification (Pixel 8 Pro): set `image_anchors = NULL` and deleted all 47 rows of the imported Empire of the Damned in the live DB, reopened the book. ~40 s later logcat: `image upgrade for 8e78d233: 48 anchors, 47 images`; DB: 48 anchors, 47 rows; `word_position`, `updated_at`, `last_read` and the session count identical before and after; cover and title figures visible in the still-open reader. Reviewed-build parse of this 1.4 MB-text, 47-image EPUB plus worker preparation and background store fits inside that window with the 3 s start delay.

Review round 4 (one fresh reviewer, conventions inlined). Fixed: (1) an EPUB imported *after* this change with no images still stored `image_anchors = NULL`, so it would have been re-parsed once on open for nothing; `commitBook` now passes `payload.imageAnchors ?? []` for EPUBs and `addBookWithContent` writes the JSON whenever anchors are offered, so NULL means only "pre-image import" (schema comment and test updated); (2) the content cache is patched with `setQueryData` instead of refetching the whole chunked text; (3) the re-parse runs in its own frame so the file bytes and parser payload are released before rows are written; (4) `readOriginalFile` shared between repair and upgrade carries the "not Filesystem.readFile" rationale once; (5) `toDbAnchors` shared by import and upgrade; (6) a text mismatch reports `book_images_upgrade_mismatch` to telemetry so parser drift is measurable; (7) tests: web build case, match / mismatch / once-per-session cases for `upgradeBookImages` against real SQLite; (8) duplicate WHY comment dropped. Suites: capacitor 832, e2e image + import + highlights green.

Re-verified on the Pixel with the reviewed build: anchors cleared and rows deleted in the live DB, book reopened, `image upgrade for 8e78d233: 48 anchors, 47 images`, `word_position` and `updated_at` unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
EPUBs imported before image support gain their images automatically on first open, without touching progress.

- `queries/books.ts`: `setBookImageAnchors(bookId, anchors, wordIndex)` writes `book_content.image_anchors` on the existing word index (`toDbAnchors`, shared with import) and returns the JSON; `books.updated_at` never moves. `addBookWithContent` now stores `[]` for an EPUB without images, so NULL means only "imported before images were captured".
- `upgrade-images.ts`: `needsImageUpgrade` (native, EPUB, `filePath`, column NULL) and `upgradeBookImages`: once per book per session, re-parses the original (`readOriginalFile`, worker-backed preparation), and when the text is byte-identical writes the anchors, patches the content cache, and stores the images through `storeBookImages`; a mismatch marks the book checked and reports `book_images_upgrade_mismatch`; failures report `book_images_upgrade_error`.
- Reader `index.tsx`: effect starts the upgrade 3 s after open.
- `sources/read-file.ts`: `readOriginalFile` shared by repair and upgrade.
- Docs: Book Import section notes the upgrade is a transition aid to remove later.

Verified on the Pixel 8 Pro twice (before and after review): 48 anchors, 47 images restored on an opened book, position and sync revision unchanged. Tests: anchor write against real SQLite, decision helper incl. web build, match / mismatch / once-per-session upgrade cases; capacitor 832, e2e image + import + highlights green.
<!-- SECTION:FINAL_SUMMARY:END -->
