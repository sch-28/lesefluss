---
id: TASK-206.2
title: 'Reader: never re-stamp an unchanged position on flush'
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
labels:
  - reader
  - bug
  - sync
dependencies:
  - TASK-208
modified_files:
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/persisted-word.ts
  - apps/capacitor/src/pages/reader/persisted-word.test.ts
  - apps/capacitor/src/services/db/queries/books.ts
  - apps/capacitor/src/services/db/queries/index.ts
  - apps/capacitor/src/services/db/__tests__/book-merge-apply.test.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/test-hooks/reader.ts
  - apps/capacitor/src/test-hooks/db.ts
  - apps/capacitor/src/main.tsx
  - apps/capacitor/e2e/position-flush-no-restamp.spec.ts
  - apps/capacitor/e2e/reader-modes.spec.ts
  - apps/capacitor/e2e/page-objects/reader.ts
  - apps/capacitor/e2e/types.d.ts
  - apps/capacitor/e2e/position-reopen.spec.ts
  - apps/capacitor/e2e/position-late-resize.spec.ts
  - apps/capacitor/e2e-repro/repro-position-bugs.spec.ts
  - apps/capacitor/e2e-repro/README.md
parent_task_id: TASK-206
priority: high
ordinal: 180100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed at normal frame rate (3/3): with the reader open after the user moved, every visibilitychange→hidden, pagehide or Capacitor pause rewrites the SAME word with a fresh updatedAt/lastRead. writePosition (pages/reader/index.tsx) has no same-word short-circuit, and queries.updateBook stamps updatedAt whenever wordPosition or lastRead is in the patch. Because updatedAt is the position's last-write-wins revision, an idle open reader keeps making its stale word "newest" (this amplifies the sync clobber subtask).

Fix: writes of a word equal to the last persisted word must not stamp a new revision (no DB write, or a lastRead-only write that does not move updatedAt; decide and justify). Check every flush path: unmount, pagehide, visibility, Capacitor pause, RSVP pause/pagehide/unmount, read-aloud stop.

Repro: scratchpad repro-v2/apps/capacitor/e2e/repro-position-bugs.spec.ts (bug 1) + test-hooks/db.ts; port it into the repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Ported regression spec: repeated hide/pagehide without movement leaves wordPosition AND updatedAt unchanged (red before, green after)
- [x] #2 A real move still saves with a new revision; RSVP pause with an unchanged word does not re-stamp
- [x] #3 Full capacitor e2e suite, vitest, tsc, biome pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 (lese-worker), parked for the TASK-208 review fixes. State so far:

Decision: a flush of the word the row already holds writes nothing at all, rather than a lastRead-only write.
- updatedAt is the LWW revision and must not move without a move.
- A lastRead-only write would need a new non-stamping query, and would reorder the library on every app switch for a book nobody moved in. Opening without moving already doesn't bump lastRead.
- Pending-position recovery stays consistent: no write means no pending entry, and the row already holds the word.

Implementation: in writePosition (index.tsx), the single funnel for every save path:
- `if (word === persistedWordRef.current) return;` before any side effect.
- persistedWordRef is the seeded DB word, the last requested write, or a BLE-applied position.
- On a failed DB write it is reset (if still ours), so a later flush retries; the pending fallback keeps the word meanwhile.
- Every flush path goes through it: unmount, pagehide, visibilitychange, Capacitor pause (web fires it from visibility), the RSVP engine's pagehide and pause/exit saves, read-aloud stop (handleSaveSpokenWord), browse commit.

Test hook: test-hooks/db.ts generalised to __lesefluss_e2e_readBookRow (wordPosition, updatedAt, lastRead), page object reader.savedRow. position-reopen and late-resize updated.

New e2e/position-flush-no-restamp.spec.ts (4 tests):
- background x3 + pagehide rewrites nothing;
- a real move after it saves with a new revision;
- back without moving since the last save rewrites nothing;
- RSVP pause, then background and exit, rewrites nothing.
Red without the guard: 3/4 fail (the 'real move' case passes both ways by design); green with it.

bug1 removed from e2e-repro/repro-position-bugs.spec.ts; README updated.

Open: the full suite was 178 passed / 1 failed. reader-modes.spec.ts waits for an 'exit save' on RSVP exit, which no longer happens for an unchanged word. Its position assertion is unaffected; the wait needs updating (compare the DB row instead).

Known interaction for TASK-206.7: persistedWordRef is not updated by a sync pull, so a reader that returns to its old word skips the write. That is safer, but the reader still doesn't follow the pulled position.

2026-10-26 resumed and finished (lese-worker), for review.

reader-modes.spec.ts: the wait for an 'exit save' on RSVP exit is gone. RSVP exits on the already-saved word, which now writes nothing; the spec's reopen assertion still checks that the tour kept the position.

The TASK-208 review fixes added __lesefluss_e2e_saveRequests at the top of writePosition, after this guard. A skipped unchanged-word flush therefore counts as no request, which the negative checks rely on.

Coverage of the flush paths:
- e2e: visibilitychange hidden x3 (on web, @capacitor/app also fires its 'pause' from it), pagehide, unmount via back, the RSVP pause save, the RSVP engine's pagehide flush, RSVP exit.
- Read-aloud stop (handleSaveSpokenWord) is Android-only, so it has no web e2e; it goes through the same writePosition guard by construction.

Results (same tree as the TASK-208 final runs):
- tsc app + e2e clean; biome clean; vitest 1324/1324.
- 3 consecutive full default runs 179/179 each, including position-flush-no-restamp (4) and the updated reader-modes.
- @lowfps 4/4.
- Red check (position-flush-no-restamp): with the guard disabled, 3/4 fail (the real-move case passes both ways by design).

2026-10-26 review fixes (3 reviewers; lese-worker):
1. RSVP exit push: the unchanged-word skip still requests the sync push when scheduleSync is set (a push stamps no revision). The pause saves without a push, so the exit is what sends it. Both push sites go through requestSyncPush, which counts __lesefluss_e2e_syncPushRequests in DEV. position-flush-no-restamp test 4 asserts that the exit requests a push.
2. Pull race: the merge decided on the pre-fetch snapshot is now written by queries.applyBookMerge in three parts, each guarded in SQL by its own stamp against the current row:
   - position (wordPosition, updatedAt, lastRead, wordCount) only WHERE updated_at < server.updatedAt;
   - metadata only WHERE metadata_updated_at < its stamp;
   - addedAt only WHERE added_at > the server's.
   updateBook takes an onlyIf condition for this. Test: src/services/db/__tests__/book-merge-apply.test.ts (real SQLite), 4 cases: a clean merge applies; a reader save between snapshot and merge survives; metadata and addedAt still apply then; a metadata edit made meanwhile survives. Red check: with onlyIf ignored (sed, restored from a copy), 3/4 fail. The reader never re-reads its persisted word from the DB.
3.-4. Tracking moved into pages/reader/persisted-word.ts (createPersistedWord: get, set, needsWrite, begin -> token, fail(token)), held in a ref in index.tsx. A failure clears the word only if no later write or seed replaced it. 7 vitest cases in persisted-word.test.ts: in-flight same word, failed write retried, a newer write of the same word not cleared by an older failure, a newer write of another word, a device set after a failing write, reset.
5. Accepted behaviour changes:
   - lastRead, the just-read pin and auto-open are no longer bumped by actions that end on the saved word (RSVP exit without moving, read-aloud start or stop without moving).
   - The BLE push retry on flush is gone; the reconnect syncPosition catches up.
6. Added to TASK-206.7's notes: the persisted word goes stale after external writes; applyBookMerge overlaps its register.
7. position-flush-no-restamp:
   - tests 1, 3 and 4 also assert that saveRequestCount is unchanged;
   - test 3 uses reader.leaveFlushed;
   - test 4 waits for the RSVP word to change before pausing.
8. reader-modes asserts savedRow.wordPosition === the chapter-2 word right after the RSVP exit; the comment is shortened.
9. persistedWordRef's description now lives in the module doc.
10. e2e-repro is biome-formatted; the README says db.repro.ts must be swapped in for db.ts.

Results (tree also holds the TASK-206.3 work in progress, see its notes):
- tsc (app + e2e) clean; biome clean (only the pre-existing warnings in library-fetch-impl and monochrome.css).
- vitest: app 1335/1335, core 194/194.
- 3 consecutive full default runs: 187/187 each (5.4-5.5 min).
- @lowfps 4/4.

2026-10-26 lese-planner: accepted after 2 review rounds (3 reviewers + verifier). Final: 3 full runs 187/187, @lowfps 4/4, vitest app 1335 / core 194, tsc app+e2e and biome clean. Remaining nits (book-merge-apply test uses buildBookMergeUpdate + equal-stamp/later-addedAt cases; explicit metadata columns in applyBookMerge) handed to lese-worker as follow-ups alongside TASK-206.3. Known gap (stale persistedWordRef after external writes) tracked in TASK-206.7.
<!-- SECTION:NOTES:END -->
