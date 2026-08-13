---
id: TASK-164.2
title: Explicit reading status with derived fallback
status: Done
assignee:
  - sch-28
created_date: '2026-08-13 09:05'
updated_date: '2026-08-13 20:08'
labels: []
milestone: m-5
dependencies:
  - TASK-164.1
documentation:
  - BOOK-MANAGEMENT.md
parent_task_id: TASK-164
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Library filtering derives status from reading position only (pages/library/sort-filter.ts), which cannot express "dropped" and loses whatever the user believes about a book.

Switch filtering onto bookStatus() from packages/core/src/books.ts (added by the phase 1 subtask): a null `status` column derives from progress, a set one wins and stays set. The derivation maps today's buckets onto the new vocabulary so no existing filter regresses — progress 0 is `want` (today's Unread), below the finished threshold is `reading`, at or above it is `finished`.

Series rows have no status column; map their existing activity aggregates onto the same labels.

Depends on the metadata columns and core helper from the phase 1 subtask.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 FilterBy is all | want | reading | finished | dropped and matchesFilter uses bookStatus() rather than raw progress
- [x] #2 A book with no explicit status lands in the same bucket it does today
- [x] #3 A book with an explicit status stays in that bucket regardless of reading position, including reading a dropped book past the finished threshold
- [x] #4 Filter popover shows the new chips; labels read Want to read and Finished instead of Unread and Done
- [x] #5 Series map their activity aggregates onto the same labels and keep working
- [x] #6 Library sort offers rating alongside title, author, recent and progress
- [x] #7 Unit tests cover the derived-vs-explicit precedence, including the dropped-then-read-to-end case
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
`matchesFilter` collapsed to a single `item.sortKey.status === filterBy` comparison once status became part of the sort key, so books and series share one code path instead of two parallel bucket calculations. Books get `bookStatus(book)`; series get `seriesStatus(activity)`, which can never return `dropped` - correct, since there is nowhere to record that decision about a series.

`isBookFinished` (FINISHED_TAIL_WORDS = 5) left alone. It is a different question from the 95% shelf threshold - whether a serial chapter reached its end - and only series-chapter-list.tsx uses it.

Rating sort puts unrated below one star rather than above five (`(rating ?? -1)`).

Verified on device against the real library: filter popover reads All / Want to read / Reading / Finished / Dropped, sort popover gained Rating, and selecting Want to read narrowed a 9-book library to the single 0% book. 13 new unit tests in pages/library/sort-filter.test.ts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Library shelves now run on `bookStatus()` instead of raw reading position, so a book can sit somewhere the position does not imply.

`FilterBy` is `all | want | reading | finished | dropped`. The derivation maps today's buckets onto the new vocabulary one-for-one (progress 0 = want, below the threshold = reading, at or above = finished), so nothing regresses: what used to read Unread now reads Want to read, and Done now reads Finished. `dropped` is reachable only by an explicit status, and an explicit status is sticky - reading a dropped book to the end leaves it dropped.

Status became part of the sort key, which let `matchesFilter` collapse to one comparison shared by books and series rather than two parallel bucket calculations. Series derive theirs from their chapter aggregates and can never be dropped.

Sort gained Rating (unrated ranks below one star).

Verified on device against a real 9-book library: both popovers read correctly and Want to read narrows to the single unstarted book. Covered by 13 unit tests, including the dropped-then-read-to-the-end case and the series aggregates.
<!-- SECTION:FINAL_SUMMARY:END -->
