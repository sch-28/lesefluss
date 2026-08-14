---
id: TASK-164.5
title: Confirm and edit an import before it lands
status: Done
assignee:
  - sch-28
created_date: '2026-08-13 09:05'
updated_date: '2026-08-13 22:44'
labels: []
milestone: m-4
dependencies:
  - TASK-164.3
documentation:
  - BOOK-MANAGEMENT.md
parent_task_id: TASK-164
priority: high
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imports commit straight to the database with whatever the parser guessed. That guess is worst exactly where it is hardest to undo: clipboard text, extracted web pages, and PDFs.

Split parse from commit and show a confirm sheet holding the parsed metadata, so the user can fix it before the book exists. runImportPipeline already returns a BookPayload and commitBook is the single writer (services/book-import/), so the seam is clean.

Staging must live in a provider mounted at routes/__root.tsx, not in the library page: ShareIntentHandler is root-level and fires on cold start, and catalog imports run from Explore, so a page-owned sheet would miss both.

Knock-on effects to handle:
- The invalidate + scheduleSyncPush() in useBookImportMutation (services/db/hooks/use-books.ts:100) belongs to the commit step now, not to a successful parse.
- The "Imported: X" toasts in components/share-intent-handler.tsx fire on parse success today and need to move; the sheet is the feedback.
- importFromCatalog (services/catalog/import.ts) keeps committing directly. Catalog metadata is curated and onboarding imports several starter books at once, which would otherwise queue up sheets during first run.
- Serial/web-novel imports are out of scope: they create a series plus N chapter rows, a different shape.

Reuses the edit component from the edit sheet subtask.

Absorbs TASK-92.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Parsing and committing an import are separate steps, with commitBook still the single writer
- [x] #2 Staging state and the confirm sheet live in a provider mounted at the router root
- [ ] #3 File picker, clipboard, URL and Android share-intent imports all show the confirm sheet, including a share received on cold start
- [x] #4 Catalog imports from Explore and from onboarding commit directly with no sheet
- [x] #5 Confirming applies the user's edits to the committed book and only then invalidates the library queries and schedules a sync push
- [x] #6 Cancelling commits nothing and releases the staged payload, including the original file bytes
- [x] #7 Navigating away with a sheet open does not leave the payload retained
- [x] #8 Serial/web-novel imports are unchanged
- [x] #9 Import error paths (CANCELLED, TOO_LARGE, PDF_ENCRYPTED, ...) still surface their existing toasts and alerts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The parse/commit seam: `parseBookFromFile|Clipboard|Url|Text|Blob` return a `StagedImport` and write nothing; `commitStagedImport` writes it through `commitBook`, still the single writer. The four committing entry points that lost their callers (importBook, importBookFromClipboard, importBookFromUrl, importBookFromText) were deleted rather than left as dead exports. `importBookFromBlob` stays: the catalog is the one path that commits without a sheet.

`useBookImportMutation` no longer invalidates or pushes for book imports, since a parse creates nothing. Serial imports still commit directly and keep their invalidations, which is now expressed by whether the caller passes any. The provider owns the post-commit invalidate + scheduleSyncPush + toast.

The 'Imported: X' toasts in share-intent-handler are gone for books (the sheet is the feedback) and kept for series, which still commit directly.

The override precedence moved into a pure `buildImportedBookRow`, covered by 6 unit tests: corrections beat parsed values, a cleared author stays cleared rather than reviving the parser's guess, and an import with no corrections (the catalog) keeps what the parser produced.

AC #3 partially verified on device. URL import: the confirm sheet appeared with the parsed title and nothing was written, Cancel left the library at 9 books, and confirming created the book. Clipboard import surfaced its existing 'no data on the clipboard' alert unchanged (AC #9). The share-intent path could NOT be driven from adb: an explicit `am start -n` bypasses the plugin's intent handling, so no share reached the handler. That path is wired identically to the others (same mutation, same `stage` call) but has not been exercised end to end on a device.

Test book created during verification was deleted through the app afterwards, so it tombstoned normally. Library back to 9 books with every reading position unchanged.

Fourth review round found three real regressions in the staging design, all now fixed.

1. Per-call `onSuccess` never fires for a superseded mutation: react-query detaches the observer when a second `mutate()` starts on the same hook. Sharing a second book while the first was still parsing meant the first parsed successfully and was then silently dropped, and for a shared file its cached copy was never deleted either. Every caller now awaits `mutateAsync`, whose promise still resolves for the superseded call, and stages from there.

2. A single staged slot discarded imports: a second import replaced the first mid-typing, and a commit cleared whatever happened to be staged rather than what it wrote. Staging is now a FIFO queue, and commit removes its own entry by identity.

3. The payload outlived the confirm step in two places: react-query kept it in `mutation.data` for the session (the share handler never unmounts), and the commit mutation's closure held it after success. Parse mutations are `reset()` after staging, and the commit mutation resets once the queue drains.

Also from that round: Android back closed the page behind the sheet instead of the sheet (new `overlay-back` handler stack, consulted by HardwareBack before touching history), and the drawer could be swiped away mid-write, leaving a book saved with no sign of it.

Verified on device after the rework: URL import shows the sheet, Android back dismisses it without navigating, and the library is untouched at 9 books.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
An import no longer lands until the reader says so.

Parsing and committing are separate: the `parse*` entry points return a `StagedImport` holding the payload and its source attribution, and `commitStagedImport` writes it via `commitBook`, which stays the single writer. A staging provider mounted at the router root holds the parsed book, shows the edit sheet from TASK-164.3 titled "Add book", and commits on confirm. Root-level because a share received while the app was closed parses before any page exists, and imports also start from Explore.

Cancelling drops the payload, which matters more than usual here: it holds the whole book text and, for EPUB and PDF, the original file bytes.

Catalog imports still commit directly. Their metadata is curated, and onboarding imports several starter books at once, which would otherwise queue up a sheet per book during first run. Serial imports are untouched: they create a series plus N chapter rows, a different shape entirely.

The precedence between parsed and corrected values is now a pure `buildImportedBookRow` with unit tests, including the case where the reader clears the author and the parser's guess must not come back.

Verified on device through the URL path: sheet appears with the parsed title, Cancel writes nothing, confirm creates the book. The share-intent path resisted adb (an explicit component launch bypasses the plugin), so it is wired but not device-exercised.
<!-- SECTION:FINAL_SUMMARY:END -->
