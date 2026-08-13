---
id: TASK-164.8
title: Give the reading position its own revision stamp
status: Done
assignee:
  - sch-28
created_date: '2026-08-13 20:32'
updated_date: '2026-08-13 20:39'
labels: []
milestone: m-5
dependencies:
  - TASK-164.1
documentation:
  - BOOK-MANAGEMENT.md
parent_task_id: TASK-164
priority: high
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by review of TASK-164.1. Must land before TASK-164.3 (the edit sheet), which is the first writer that arms it.

`word_position` is merged last-write-wins on the row's `updated_at`, on both sides. That was sound while `updated_at` was derived as `max(lastRead, addedAt)`: the stamp could only advance on a real read, so a device holding a stale position necessarily held a stale stamp and could never win the gate. TASK-164.1 made `updated_at` a general revision stamp that any edit moves, which removes that guarantee.

Failing scenario, both devices on the new build:
1. Device A reads to word 5000 at T1 and pushes. Server: word_position 5000, updated_at T1.
2. Device B is still at word 1000. The reader sets a rating on B at T2 greater than T1.
3. B's full-snapshot push carries word_position 1000 with updated_at T2, wins the gate, and the server position drops to 1000.
4. A pulls, sees a newer revision, and rolls back locally too. Silent word loss on both devices.

Reusing `lastRead` as the position's stamp does NOT work, and was rejected: `commitChapter` sets `lastRead` without moving the position, and `handleChapterJump` moves the position without setting `lastRead`. The stamp has to be its own column.

Backward compatibility matters here: a deployed client that does not send the new field must keep syncing its position correctly, so the server has to fall back to `updated_at` for those payloads (under the old scheme that WAS the position's stamp).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 books gains position_updated_at (NOT NULL) via a capacitor migration, backfilled to MAX(COALESCE(last_read,0), added_at) so no existing book changes its effective position revision
- [x] #2 sync_books gains position_updated_at via a web migration, backfilled from updated_at for the same reason
- [x] #3 updateBook stamps position_updated_at exactly when the patch moves wordPosition, and honours an explicitly supplied value so the sync pull can replay another device's stamp
- [x] #4 SyncBookSchema carries positionUpdatedAt as optional so payloads from clients that pre-date it still validate, and bookToSync sends it
- [x] #5 The server gates word_position on the position stamp, falling back to updated_at when the payload omits it, so a client that pre-dates the field still syncs its position
- [x] #6 buildBookMergeUpdate merges wordPosition and lastRead only when the server's position stamp is newer, independently of the metadata gate
- [x] #7 A metadata-only edit on a device holding a stale position leaves both the server's and every other device's position untouched, covered by a test on each side
- [x] #8 A genuine position advance still wins on both sides, including from a client that sends no position stamp
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Client migration 0031 and web migration 0017. The client backfills to MAX(COALESCE(last_read,0), added_at); the server backfills from updated_at, which is the same value by construction (that expression is what the client pushed as updated_at before 0030).

`sync_books.position_updated_at` is nullable rather than NOT NULL: rows last written by a deployed client that pre-dates the column legitimately have none, and both the server CASE and the client merge COALESCE to updated_at for those. A NOT NULL column would have forced a fabricated value on rows nobody has re-pushed yet.

`buildBookMergeUpdate` now returns an update when EITHER gate opens, and sets `updatedAt` explicitly to max(server, local). Without that, a position-only merge would let `updateBook`'s default stamp drag the row's revision backwards to the server's older value, making a local metadata edit look older than it is.

Both new tests confirmed falsifiable: reverting the server gate to `lastWriteWins("word_position", ">=")` turns 'a metadata edit does not drag a stale reading position with it' red, and the client factories now force each test to state whether it means a position move or a metadata edit.

Verified on device against the real 9-book library: `Applied migration: 0031_position_updated_at`, all 9 rows backfilled to the expected value with none left at 0, and every word_position byte-identical to the snapshot taken before this change. Push after: books=9, contentUploads=0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The reading position now merges on a stamp of its own instead of the row's revision.

TASK-164.1 turned `updated_at` into a general revision stamp that any edit moves. `word_position` was still gated on it, on both sides, and that gate was only ever safe because the old derived stamp (`max(lastRead, addedAt)`) could not advance without a read. Once a status or rating can be written, a device sitting on an old position out-ranks a newer position from another device simply by rating a book: the server takes the stale position, and every other device pulls the rollback. Silent word loss, and the failure the app's users are least able to recover from.

`position_updated_at` lands on `books` (migration 0031) and `sync_books` (0017), backfilled on both sides to the value that played that role before. `updateBook` stamps it exactly when the patch moves `wordPosition`, and honours an explicit value so the pull can replay another device's stamp. The server gates `word_position` on it and the client gates its half of the merge on it, both falling back to `updated_at` when a payload carries no stamp, so a deployed client that pre-dates the column keeps syncing its position correctly.

`buildBookMergeUpdate` now opens either gate independently and pins `updatedAt` to max(server, local), so a position-only merge cannot drag the row's revision backwards.

Found by the second review round; the reviewer's first proposed fix (reuse `lastRead` as the stamp) was rejected because `commitChapter` moves `lastRead` without the position and `handleChapterJump` moves the position without `lastRead`. Verified with falsifiable tests on both sides and on device against a real 9-book library, where every position came through the migration unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
