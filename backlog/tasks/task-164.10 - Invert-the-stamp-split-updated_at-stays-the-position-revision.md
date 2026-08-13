---
id: TASK-164.10
title: 'Invert the stamp split: updated_at stays the position revision'
status: Done
assignee:
  - sch-28
created_date: '2026-08-13 21:52'
updated_date: '2026-08-13 22:04'
labels: []
milestone: m-5
dependencies:
  - TASK-164.8
documentation:
  - BOOK-MANAGEMENT.md
parent_task_id: TASK-164
priority: high
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the third review round. TASK-164.1 and TASK-164.8 split the row revision the wrong way round, and the current working tree would destroy reading positions on clients already in users' hands.

Every released build (HEAD, v1.5.1) treats `updated_at` as THE READING POSITION's revision: it derives it as `max(lastRead, addedAt)` on push, and on pull does `if (serverBook.updatedAt > localUpdatedAt) { wordPosition = server's; lastRead = server's }`. `fullSync` pulls before it pushes.

TASK-164.1 made `updated_at` a general row revision that any metadata edit moves. So:
1. Tablet on the OLD build is offline and the user reads to word 5000. Nothing pushed.
2. Phone on the NEW build rates the book. `updated_at` jumps; the server correctly keeps the old position.
3. Tablet reconnects. Its pull runs first, sees the newer `updated_at`, and adopts the server's older position. Word 5000 is destroyed before the push that would have saved it.

New builds are protected by `position_updated_at`; old builds are not, and store rollout means they persist for months. The rollout cannot be gated: the vulnerable builds already exist.

Fix: invert. `updated_at` goes back to meaning what deployed clients believe (it moves when the reading position moves), and a NEW `metadata_updated_at` column carries the reader-editable fields on both sides. Verified cheap: the released pull merge never applied title/author to an existing row, handles deletions before the gate, and receives content through the separate content path, so the only thing an old client loses is `wordCount` refresh timing.

This also dissolves the server-side `GREATEST` laundering found in the same round, since there is no position stamp for a legacy push to inflate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 books gains metadata_updated_at and drops position_updated_at, via a new migration rather than editing an applied one
- [x] #2 sync_books does the same, and the server no longer carries a position stamp
- [x] #3 updateBook stamps updated_at only for writes that move the reading position or lastRead, and metadata_updated_at only for reader-editable fields
- [x] #4 bookToSync sends updated_at with the released meaning, so an old client pulling a metadata edit never adopts a stale position
- [x] #5 buildBookMergeUpdate gates the position on updated_at, as the released client does, and the metadata fields on metadata_updated_at
- [x] #6 The server gates word_position on updated_at and the metadata columns on metadata_updated_at
- [x] #7 lastRead never moves backwards through a merge
- [x] #8 A test proves an old-style payload (metadata edit, position unchanged) leaves the local position untouched
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Migrations 0032 (SQLite) and 0019 (Postgres) add metadata_updated_at seeded from updated_at and drop position_updated_at. New migrations rather than edits to 0031/0017, which were already applied on the test device.

updateBook now stamps the two columns from different triggers: updated_at when the patch moves wordPosition or lastRead, metadata_updated_at when it touches any of the six reader-editable columns. A write touching neither (isActive, filePath) still stamps nothing.

The server merge went back to gating word_position on updated_at, which is what every released client means by it, and lastWriteWins picks the revision per column: metadata columns COALESCE(metadata_updated_at, updated_at), everything else updated_at.

Round-3 findings also fixed in this pass: lastRead is now Math.max so a merge cannot regress library recency (C3); the library page memoises the sheet's seed values, which was silently discarding in-progress edits on every re-render and explains an earlier on-device save that moved updated_at without changing the rating (V1); the Book <-> BookEditValues mappings moved into shared adapters (V2); a stray doc comment, an `as HeaderAction` cast behind a widened headerActions prop, and the hardcoded half-star factor (V3/V4/V5).

S1: the four new free-text inputs now carry maxLength matching SyncBookSchema, and editValuesToPatch clamps on save including the tags JSON. Without it one long paste 400s the entire push payload and silently stops sync for books, highlights, glossary, settings and sessions alike.

S3: a tombstone now clears description/language/status/rating/review/tags on both sides. The first attempt only covered the claiming merge path; the integration test caught that a delete push claims no metadata and therefore takes the preserving path, so the clearing had to apply to both.

S2 refuted as pre-existing: updatedAt has always been an unbounded client-supplied timestamp merged with GREATEST.

Verified on device against the real 9-book library: migration 0032 applied, all 9 rows seeded metadata_updated_at = updated_at, every word_position byte-identical to the snapshot taken before this rework, push clean at contentUploads=0. Test residue from earlier runs (two ratings) removed; the library is back to exactly its pre-testing state.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The row revision was split the wrong way round, and this puts it right before anything ships.

TASK-164.1 turned `updated_at` into a general revision that any edit moves. Every released build reads that column as the reading position's revision: it derives it as `max(lastRead, addedAt)` on push and, on pull, adopts the server's position whenever the server's value is higher, with the pull running before the push. So a metadata edit on an updated device would make an older device throw away reading it had not yet pushed. Silent word loss, on builds already in users' hands, unfixable by gating the rollout.

`updated_at` now keeps the meaning every client already assumes: it moves when the reading position or `lastRead` moves, and at no other time. The reader-editable fields carry `metadata_updated_at`, added by migrations 0032 and 0019 and seeded from `updated_at`. Both merges gate on the matching stamp, falling back to `updated_at` for rows and payloads written before the column existed.

This also dissolved the server-side `GREATEST` laundering found in the same review round: with no position stamp, a legacy push has nothing to inflate.

Verified: 517 client tests, 33 server tests including a real-Postgres case for each rollout direction, and on device against a real library where every reading position came through the migration unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
