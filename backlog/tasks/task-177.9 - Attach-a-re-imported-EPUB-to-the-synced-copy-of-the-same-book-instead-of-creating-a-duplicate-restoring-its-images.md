---
id: TASK-177.9
title: >-
  Attach a re-imported EPUB to the synced copy of the same book instead of
  creating a duplicate, restoring its images
status: Done
assignee:
  - '@claude'
created_date: '2026-10-02 16:21'
updated_date: '2026-10-02 19:39'
labels:
  - book-import
  - sync
  - reader
dependencies:
  - TASK-177.6
modified_files:
  - apps/capacitor/src/services/book-import/attach-original.ts
  - apps/capacitor/src/services/book-import/commit.ts
  - apps/capacitor/src/services/book-import/store-images.ts
  - apps/capacitor/src/services/book-import/upgrade-images.ts
  - apps/capacitor/src/services/book-import/index.ts
  - apps/capacitor/src/services/book-import/__tests__/attach-original.test.ts
  - apps/capacitor/src/services/book-import/__tests__/upgrade-images.test.ts
  - apps/capacitor/src/contexts/import-staging-context.tsx
  - apps/capacitor/src/pages/library/book-edit-sheet.tsx
  - apps/capacitor/e2e/helpers/seed.ts
  - apps/capacitor/e2e/import-attach.spec.ts
  - agents/capacitor.md
parent_task_id: TASK-177
priority: high
ordinal: 128000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem

A fresh install pulls every book from sync as `fileFormat: "txt"` with no `filePath`, no `image_anchors` and no `book_images` rows. The reader still has the original EPUB files, but there is no way to connect one to its synced book: importing the file creates a duplicate with no progress, and the repair (TASK-177.5) and upgrade (TASK-177.6) paths both require the original on disk. Synced illustrated books therefore stay image-free forever on every device except the one that imported them.

## Outcome

- One shared attach routine: given an existing book and a freshly parsed payload whose text is byte-identical to the stored content, it keeps the original file (native), records `filePath` and `fileFormat` device-locally, writes the image anchors on the book's existing word index, and stores the images in the background the way an import does. The text, word index, position, sessions, highlights and sync revision of the book do not change.
- When an EPUB is imported through any staged path (file picker, share, URL) and a library book without an original file has the same text, the confirm sheet says so and offers "Attach to existing" next to "Add to library". Attaching closes the sheet, shows no duplicate in the library, and the book's figures appear on its next open (or while it is open).
- Matching is exact: content byte length as a cheap prefilter (`books.size`, which sync round-trips as `fileSize`; word count for legacy rows that lack it), then a full content comparison. A book imported with an older parser whose text differs is not a match, and the sheet offers the normal add.
- Works on the web build too (every book there has no original file): attaching writes anchors and images, skips the file copy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Importing an EPUB whose parsed text equals a library book without an original file shows an attach option in the confirm sheet naming that book; a book with different text, or one that already has an original file, shows no such option
- [x] #2 Choosing attach leaves the library with one book of that title, writes image_anchors and book_images for it, and on native records filePath and fileFormat without moving books.updated_at, metadata_updated_at or word_position (unit test against real SQLite)
- [x] #3 After attaching, opening the book renders its figures; if the book was open during the attach, figures appear without reopening
- [x] #4 Choosing Add to library still creates a separate book as before
- [x] #5 E2E: import the image-free variant of the fixture, read to a position, re-import the image-bearing variant, attach, and assert one library entry, the saved position restored and the figures rendered
- [x] #6 Unit tests cover the candidate lookup (size and content prefilter, no filePath, exact text) and the attach routine; parser, capacitor and e2e suites pass
- [x] #7 agents/capacitor.md Book Import section documents the attach path
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. `services/book-import/attach-original.ts`:
   - `findAttachCandidate(payload: BookPayload): Promise<Book | null>`: EPUB payloads only. Prefilter `queries.getBooks()` by `!filePath` and `size === utf8ByteLength(payload.content)` (or `size === 0 && wordCount === WordIndex.build(content).wordCount` for legacy rows), then `getBookContent(id).content === payload.content`. First match wins.
   - `attachOriginalToBook(book, payload): Promise<void>`: native + `payload.original` → `saveOriginalFile` (exported from `commit.ts`, now returns the path or null), `updateBook(id, { fileFormat }, now, { isDeviceLocal: true })`; `loadBookWordIndex(id)` → `setBookImageAnchors(id, payload.imageAnchors ?? [], wi)` and patch the content cache (`patchCachedAnchors` moved out of `upgrade-images.ts` into `store-images.ts` so both use it); `storeBookImages(id, images, "book_images_attach_error")` in the background, awaited only when the caller asks (same shape as `commitBook`). Log one `book-import` line.
2. `commit.ts`: export `saveOriginalFile`.
3. `book-import/index.ts`: export `findAttachCandidate`, `attachOriginalToBook`.
4. `book-edit-sheet.tsx`: optional `alternative?: { hint: string; label: string; onSelect: () => void; isPending?: boolean }` rendered above the footer; both buttons disabled while either action is pending.
5. `import-staging-context.tsx`: on `current` change look up the candidate (effect, stale-guarded); `attach` mutation → invalidate `bookKeys.all`, drop from queue, cleanup, `toast.success('Attached to "…"')`. `alternative` passed when a candidate exists.
6. Tests: `__tests__/attach-original.test.ts` (real SQLite: candidate by size+content, rejected on filePath / different text / size mismatch; attach writes anchors + fileFormat, calls `storeBookImages`, leaves `updated_at` / `metadata_updated_at` / `word_position`; web skips the file).
7. E2E `e2e/import-attach.spec.ts`: seed `withoutImages(strayAnchorFixture())`, open, tap a word (save), back; import the full fixture → sheet shows "Attach to existing"; click; one card; reopen → saved word in viewport and `.reader-figure` count > 0. Second case: a different fixture shows no attach option; "Add to library" adds a second card.
8. Docs: `agents/capacitor.md` Body images bullets gain "Attach".
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Candidate lookup keys on `books.size`: commit sets it to `utf8ByteLength(content)` and the sync push/pull round-trips it as `fileSize`, so the byte length is a free prefilter and the full chunked content read happens only for same-length books. Legacy server rows carry 0 and fall back to the payload's word count (one `WordIndex.build`, lazily).

Anchors are written before the file copy on purpose: an open reader re-reads the book row when `filePath` lands, and `needsImageUpgrade` would start a 3 s re-parse if it saw an EPUB with an original and a NULL anchor column.

The e2e stand-in for a synced copy is `withoutImages(strayAnchorFixture())`: same text, no anchors, no rows; on the web build every book lacks an original, so it is also what attach looks for there. `lastSavedWord` cannot be read after `page.goto` (the e2e save hook is per page load), so the restored position is asserted on reopen instead.

AC #3's open-reader case rides on the same `patchCachedAnchors` + `bookKeys.images` invalidation the import and upgrade paths use; not separately e2e-tested (the sheet is reachable from the reader only via a share intent).

Pre-existing unrelated tsc error in `src/pages/reader/index.tsx:1792` (`content` is `string | null`, `RsvpView` wants `string`): comes from the other session's edit of `rsvp-view.tsx` today, not from this task.

Review round (three fresh-context reviewers: general, correctness/races, conventions/tests). Fixed: (1) a just-committed book whose deferred file copy was still running could be offered as an attach target, and attaching would have written the same file twice concurrently; `commit.ts` now tracks in-flight copies (`isSavingOriginal`) and the lookup skips them (test with a blocked `writeFile`); (2) "Add to library" was live while the candidate lookup ran, so a quick tap created the duplicate the offer prevents; the sheet now has a `checking` state that disables saving and exposes `data-alternative-state` for tests; (3) the offer sat outside the scroll area and pushed the footer off a phone-height drawer; it now sits at the top of the fields (checked at 390x780: offer and both footer buttons visible without scrolling); (4) a failed file copy was reported as success; `attachOriginalToBook` returns `fileCopyFailed`, reports `book_original_attach_error`, and the toast says the file could not be kept; (5) the success invalidation used the `books` prefix and re-read the open reader's whole text; now exact keys for the list and the row; (6) on the web build every EPUB was a candidate, including one that already had its images; books with anchor entries are skipped there (an image-free `[]` book is still offered, which is also what the e2e stand-in needs); (7) `removeBook` re-reads `filePath` so a file that landed after the caller loaded the row is unlinked; (8) legacy `size: 0` rows with `wordCount: 0` no longer trigger a `WordIndex.build`; (9) e2e: `stageEpubViaFilePicker` extracted into the seed helper, position proven with a TOC jump to chapter 2 and the chapter art figure, library count asserted after the toast, the no-offer case waits for the lookup to settle; (10) unit tests prove the prefilter through `getBookContent` spies, plus tombstone, in-flight copy, missing word index and failed copy cases, and assert `patchCachedAnchors`; (11) comment trims, `alternativeAction` / `attachCandidate` names, button copy `Attach`, hint branches on whether the file has images. Accepted and documented: the reader's edits in the sheet are not applied to the existing book on attach; a focus refetch racing the anchor patch can at worst trigger one redundant upgrade re-parse (rows conflict-free); the pre-existing orphan `book_images` row after a delete racing a write is unchanged. Suites after the round: capacitor 892, e2e attach + import + bulk-select + detail 18/18.

Post-merge review follow-up: the attach candidate was state synced to `current` by an effect, so the render between the queue advancing and the effect rerunning showed the next file's form with the previous book's offer, and a tap there would have attached the wrong EPUB (sub-frame window, never re-verified by `attachOriginalToBook`). The lookup result is now stored together with the import it was found for and only offered while that import is `current`; otherwise the sheet is in the checking state with saving off. Also `busy` renamed `isBusy` in the context and the sheet, and the comment on `isSavingOriginal` dropped. Rerun: book-import unit 39/39, e2e attach + import-epub 3/3.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A re-imported EPUB now attaches to the synced copy of the same book instead of becoming a duplicate, and the synced copy gets its images and original file back.

- `attach-original.ts`: `findAttachCandidate(payload)` finds a library book with byte-identical text and no original on this device (`books.size` prefilter, word count for legacy rows, full content compare; skips books whose file copy is in flight and, on web, books that already have images). `attachOriginalToBook(book, payload)` writes the anchors on the existing word index, copies the file and records `filePath` + `fileFormat` device-locally (native), stores images in the background, and returns whether the copy failed. Nothing sync sees changes.
- Confirm sheet: an "Attach" offer with the reason at the top of the fields; "Add to library" stays disabled until the lookup settles. Success and failed-copy toasts.
- `commit.ts`: `saveOriginalFile` exported with an in-flight set; `removeBook` re-reads the file path. `patchCachedAnchors` shared via `store-images.ts`.
- Tests: 12 unit cases on real SQLite (prefilter via content-read spies, stamps untouched, failed copy, web rule, tombstone, in-flight copy); e2e `import-attach.spec.ts` (attach keeps position and shows figures with one library entry; a different book gets no offer). Shared `stageEpubViaFilePicker` helper.
- Docs: Attach bullet in `agents/capacitor.md`.

Verified: capacitor 892 unit tests, e2e attach + import + bulk-select + detail 18/18, phone-height layout check. Three fresh-context reviews, all must-fix and should-fix findings applied.
<!-- SECTION:FINAL_SUMMARY:END -->
