---
id: TASK-164.9
title: Half-star ratings
status: Done
assignee:
  - sch-28
created_date: '2026-08-13 21:13'
updated_date: '2026-08-13 22:04'
labels: []
milestone: m-5
dependencies:
  - TASK-164.3
documentation:
  - BOOK-MANAGEMENT.md
parent_task_id: TASK-164
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Requested after TASK-164.3 shipped: ratings need half-star precision, and clearing needs its own control rather than being hidden behind a third tap.

Tapping a star sets it full; tapping the same star again drops it to half; tapping again returns to full. A separate Clear button unsets the rating.

Storage: `rating` stays an INTEGER column and counts HALF-STARS, so 1..10 where 7 means three and a half stars. Chosen over a real/float column because SQLite cannot change a column's declared type without a full table rebuild, and integers avoid float equality drift across the SQLite/JSON/Postgres round trip.

No data conversion is needed: neither `books.rating` nor `sync_books.rating` has shipped to any user, and production does not yet have the column at all. Only the Postgres CHECK constraint has to widen from 1..5 to 1..10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 rating is documented and validated as half-stars, 1..10, in the SQLite schema, the Postgres schema and SyncBookSchema
- [x] #2 A web migration widens the sync_books rating CHECK from 1..5 to 1..10 without a table rewrite
- [x] #3 Tapping a star sets it full, tapping the same star again sets it half, and tapping once more returns it to full
- [x] #4 A Clear button unsets the rating, and it is only offered when a rating is set
- [x] #5 The star row renders halves correctly, including a half on the first star
- [x] #6 The rating cycle is a pure function with unit tests covering full, half and switching to a different star
- [x] #7 Rating sort still ranks higher first with unrated last
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified on device: 3.5 and 0.5 both render correctly (half drawn by clipping a filled star over an empty one), the Clear link appears only when a rating is set, and rating=1 round-tripped to SQLite. 13 core unit tests cover the tap cycle including a half on the first star and a range sweep.

Review round 3 moved the half-star factor into core as HALF_STARS_PER_STAR plus a starFill(rating, star) helper, so the 2:1 encoding is no longer re-derived in the view.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ratings carry half-star precision.

`rating` stays an INTEGER and counts half-stars, 1..10, so 7 is three and a half. Chosen over a real column because SQLite cannot change a column's declared type without rebuilding the table, and 0.5 steps would drift across the SQLite/JSON/Postgres round trip. No data conversion was needed: the column had never shipped.

Tapping a star sets it full, tapping the same star again drops it to half, tapping once more returns it to full, and a separate Clear button unsets the rating, so no tap sequence can leave a reader unable to express half a star. Halves render by clipping a filled star over an empty one, which keeps the two aligned at any size.

`nextRating`, `ratingStars`, `starFill` and the `HALF_STARS_PER_STAR` factor live in packages/core; the view no longer re-derives the encoding. Postgres migration 0018 widens the CHECK from 1..5 to 1..10 with NOT VALID plus VALIDATE so it does not hold an ACCESS EXCLUSIVE lock through a scan.
<!-- SECTION:FINAL_SUMMARY:END -->
