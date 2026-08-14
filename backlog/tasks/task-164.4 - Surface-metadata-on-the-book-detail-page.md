---
id: TASK-164.4
title: Surface metadata on the book detail page
status: Done
assignee:
  - sch-28
created_date: '2026-08-13 09:05'
updated_date: '2026-08-13 22:13'
labels: []
milestone: m-5
dependencies:
  - TASK-164.3
documentation:
  - BOOK-MANAGEMENT.md
parent_task_id: TASK-164
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pages/library/book-detail.tsx renders cover, facts, chapters, journey, highlights and sessions, with Delete as its only header action. None of the new metadata has a home yet.

Surface rating, status, description, tags and review on the page, and add an entry point to the edit sheet from both the detail page header and the library long-press action sheet (pages/library/index.tsx).

DetailShell currently accepts a single headerAction and needs to accept more than one for Edit to sit beside Delete.

Note the existing hook-order constraint in book-detail.tsx: hooks must stay above the isPending / !book early returns, or the first render transition throws React error #310.

Depends on the edit sheet subtask.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Rating, status, description, tags and review are visible on the detail page, and absent fields leave no empty scaffolding behind
- [x] #2 Detail page header offers Edit alongside Delete
- [x] #3 Library long-press action sheet offers Edit
- [x] #4 DetailShell accepts multiple header actions without changing existing call sites' behaviour
- [x] #5 Editing from either entry point updates the page without a manual reload
- [x] #6 A book with none of the new fields set looks no worse than it does today
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Status leads the facts row because it is the one fact the reader chose rather than earned; rating follows as a compact star row. Tags render as chips and the review as a 'Your notes' card, both only when set, so a book with none of the new fields renders exactly as before apart from the status chip (which is always derivable).

The reader's own description outranks the catalog blurb in the About card: they wrote it knowing the catalog text was already there.

`RatingStars` is a separate read-only component rather than a mode on the sheet's interactive row. Same clipping technique for halves, but the sheet's version carries tap targets and this one carries an aria-label reporting the value.

Verified on device by seeding one book with status/rating 7 (3.5 stars)/tags/description/review: all five render, the half star draws correctly at small size, and Edit sits beside Delete in the header. Seed cleared afterwards; library back to zero residue.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The detail page now shows what the edit sheet writes.

The facts row leads with the shelf (Want to read / Reading / Finished / Dropped) followed by a compact star row when the book is rated. Tags render as chips, the reader's notes as their own card, and a reader-written description takes the About card over the catalog blurb. Every one of those is conditional, so a book with none of them looks as it did before.

Edit sits beside Delete in the header, which needed `DetailShell.headerAction` widened to `headerActions` (done in the edit-sheet slice), and Edit is also in the library long-press menu.

`RatingStars` is a read-only component separate from the sheet's interactive row: halves are drawn by clipping a filled star over an empty one, and it carries an aria-label reporting the value rather than tap targets.

Verified on device against a real book, seeded and then cleared.
<!-- SECTION:FINAL_SUMMARY:END -->
