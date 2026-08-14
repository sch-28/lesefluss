---
id: TASK-164.7
title: Show book metadata on the website profile
status: Done
assignee:
  - sch-28
created_date: '2026-08-13 09:06'
updated_date: '2026-08-13 23:21'
labels: []
milestone: m-5
dependencies:
  - TASK-164.1
documentation:
  - BOOK-MANAGEMENT.md
parent_task_id: TASK-164
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The /profile page on the website lists a signed-in user's library and highlights from sync_books, but knows nothing about rating, status, tags or description, so a book edited in the app looks unchanged on the web.

Surface those fields read-only, deriving status through bookStatus() from packages/core so the website and the app agree on what "finished" means. Editing stays in the app.

apps/web/src/lib/profile.ts currently carries its own FINISHED_THRESHOLD constant; the phase 1 subtask replaces it with the shared helper, and this task should be built on top of that rather than reintroducing a local copy.

Depends on the phase 1 subtask.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Profile page shows rating, status, tags and description for each book, with absent fields rendering nothing rather than empty labels
- [x] #2 Status is derived through bookStatus() from packages/core, not a website-local threshold
- [x] #3 The page stays read-only, with no edit controls
- [x] #4 Books synced from a client that predates these fields render without errors
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Status is derived with `bookStatus()` from packages/core, the same call the app makes, so a book cannot read as Finished in one place and Reading in the other. The local FINISHED_THRESHOLD was already gone (removed in the phase 1 subtask).

The star row and `parseTags` are reimplemented locally rather than imported: they live in apps/capacitor, and the website has no dependency on the app package. The half-star clipping technique is duplicated deliberately, and the shared half-star encoding still comes from core (`starFill`, `RATING_STARS`, `ratingStars`), so the two cannot drift on what a rating means.

Every field is conditional: a book with no rating, tags or description renders exactly as before apart from the status line, which is always derivable. Books synced from a client that pre-dates the columns arrive with NULLs and take those same branches.

Verified by typecheck and a production build of the website. NOT verified visually: /profile needs a signed-in session against a database that has migration 0016+ applied, and production does not have it yet. The layout is a 4-5 column thumbnail grid, so the description is clamped to two lines and the tags to one; worth a look once this is deployed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A book edited in the app now looks edited on the website.

The profile's library grid shows each book's shelf, rating, tags and description, all read-only. Editing stays in the app, which is the only place with the sheet.

Status comes from `bookStatus()` in packages/core, the same derivation the app uses, so the two cannot disagree about what Finished means. The star row and the tags parser are reimplemented locally because the website does not depend on the app package, but both sit on core's half-star helpers, so the meaning of a rating stays in one place.

Every field is conditional, so a book with none of them renders as it did before apart from the status line.

Typechecked and built; the page itself needs a signed-in session against a migrated database, which production does not have yet.
<!-- SECTION:FINAL_SUMMARY:END -->
