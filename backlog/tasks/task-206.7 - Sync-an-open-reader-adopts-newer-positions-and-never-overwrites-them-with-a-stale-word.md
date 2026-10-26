---
id: TASK-206.7
title: >-
  Sync: an open reader adopts newer positions and never overwrites them with a
  stale word
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
labels:
  - reader
  - bug
  - sync
dependencies:
  - TASK-206.2
modified_files:
  - apps/capacitor/src/services/db/queries/books.ts
  - apps/capacitor/src/services/db/queries/index.ts
  - apps/capacitor/src/services/db/__tests__/reader-position-register.test.ts
  - apps/capacitor/src/services/position-revisions.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/services/serial-scrapers/commit.ts
  - apps/capacitor/src/contexts/book-sync-context.tsx
  - apps/capacitor/src/contexts/sync-context.tsx
  - apps/capacitor/src/pages/reader/external-position.ts
  - apps/capacitor/src/pages/reader/external-position.test.ts
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/components/toast.tsx
  - apps/capacitor/src/test-hooks/reader.ts
  - apps/capacitor/src/test-hooks/db.ts
  - apps/capacitor/src/main.tsx
  - apps/capacitor/e2e/position-external.spec.ts
  - apps/capacitor/e2e/page-mode-turn-after-jump.spec.ts
  - apps/capacitor/e2e/page-objects/reader.ts
  - apps/capacitor/e2e/types.d.ts
  - apps/web/src/lib/sync-book-upsert.ts
  - apps/web/src/lib/sync-book-upsert.integration.test.ts
parent_task_id: TASK-206
priority: high
ordinal: 180600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed at normal frame rate (3/3, both variants): with a book open after the user moved, a sync pull writes a newer position from another device into the DB (real buildBookMergeUpdate + updateBook). The open reader ignores it (its seed is one-shot), and the next visibility/pagehide/pause flush or back/unmount flush rewrites the stale local word with a newer revision, so the other device's progress is lost on the server. updateBook also has no "don't go backwards" guard.

Fix (scoped piece of the reference design doc "Reader position: save-on-intent design (reference)", §7 external positions and §2 register):
- Position writes are a monotonic register: `UPDATE … WHERE updated_at < :rev` with read-back, and the writer tracks the highest revision it has seen. Keep the finished_at behaviour, and keep book-detail jumps from marking a book finished.
- The open reader reacts to a newer pulled position. If there is no local move since the last seed/adopt and no gesture in progress: adopt it (smooth jump) with the toast "Moved to where you left off on another device · Undo" (10 s; a newer toast replaces it; Undo returns to the position before the first adopt). If the local position is newer and different: keep it and show "Newer position from another device · Go there". While browsing, an adopt moves only the browse anchor.
- Flushes never write a word older than a revision already observed.
- BLE keeps its furthest-wins behaviour (TASK-207) and shows no toast.
Depends on the re-stamp fix (TASK-206.2).

Repro: scratchpad repro-v2/apps/capacitor/e2e/repro-position-bugs.spec.ts (bug 2) + test-hooks/db.ts; port it into the repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Ported regression spec: a newer pulled position while the reader is idle is adopted (view moves, Undo toast) and is NOT overwritten by the visibility or unmount flush (red before, green after)
- [x] #2 When the local position is newer and different, it is kept and the Go-there toast is shown; Go there moves to the remote position
- [x] #3 Unit tests for the monotonic register: a stale write never replaces a newer row; concurrent pull vs local write ends with the newest revision
- [x] #4 Undo restores the pre-adopt position; a second adopt within 10 s replaces the toast
- [x] #5 Full capacitor e2e suite, vitest, tsc, biome pass; web sync integration tests pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 from the TASK-206.2 review (lese-worker):
- After a sync pull or a BLE "device ahead" write made behind the open reader, the reader's persisted word (pages/reader/persisted-word.ts) is stale, so an explicit action that ends exactly on the reader's old word is skipped as already saved. 206.7 must make the reader follow external writes, or invalidate the persisted word when the row's updatedAt changes to one this reader didn't write. Don't simply re-read it from the DB on every change: that brings the clobber back.
- Overlap: TASK-206.2 already guards the pull's write against the current row (queries.applyBookMerge: the position applies only while updated_at < server.updatedAt, metadata only while metadata_updated_at < its stamp, addedAt only if earlier). That is a minimal slice of 206.7's monotonic register; build on it rather than beside it.

2026-10-26 lese-planner (from TASK-206.5 red team): during RSVP playback a newer position pulled from another device is ignored (seed runs once, rsvpInitWord unchanged), and the next throttled RSVP save / pause / exit writes the local word with a newer updatedAt, clobbering the other device. Not a regression of 206.5 (before, it rewound to the entry word). For 206.7: count RSVP playback (and read-aloud) as a local move: don't adopt while playing; show the 'Newer position from another device · Go there' toast; route RSVP saves through the monotonic register.

2026-10-26 from the TASK-206.5 review: during RSVP playback a newer pulled position is ignored, and the next throttled playback save clobbers it. Count RSVP playback as a local move: show the 'Go there' toast, not an adopt.

2026-10-26 (lese-worker), for review. The smallest model: a compare-and-set register on the reader's position writes, plus one reaction to a newer row.

Register (queries/books.ts writeReaderPosition):
- The write lands only while updated_at <= baseRev, the newest revision the reader has seen, then reads the row back. It returns { isWritten, row }.
- It sits beside applyBookMerge's guards from 206.2: a pull only lands over older revisions, and the reader only over ones it has seen.
- finished_at keeps updateBook's CASE. Book-detail jumps are untouched (they don't use this write).

Reader (index.tsx):
- baseRevRef: seeded from the row at open; each write advances it to its own stamp before it is sent (writes reach the DB in order of revision, and the register drops an own older write that arrives after a newer one, which is also what latest-wins wants).
- lastLocalMoveAtRef via markLocalMove(), which replaces the 9 `userMovedRef = true` local-move sites (not the BLE follow). A recovered pending position counts at its own time.
- writePosition goes through writeReaderPosition. A write that didn't land clears the pending fallback, drops its persisted word, and hands the row to handleExternalPosition. Post-commit steps (BLE push, sync push, save log) run only for a landed write.
- handleExternalPosition(row, seenRev), called from a lost write or from the book query when a refetch shows a newer revision (a pull, a device):
  - a row holding the persisted word (ours, or a BLE position the reader already follows) only advances the revision: no toast, so BLE stays furthest-wins and silent.
  - the local position is newer when the last local move is after the row's revision, or RSVP is playing, or read-aloud owns the position. Then the reader keeps it, writes it over (now on the seen revision), and shows 'Newer position from another device' with Go there (10 s).
  - otherwise the reader adopts the row: while browsing only the anchor moves (browse.onDevicePosition); in RSVP the word shows; else showUnsavedMove. The toast is 'Moved to where you left off on another device' with Undo (10 s, one id, so a newer toast replaces it). Undo goes to the word before the first adopt in the window.
  - unmounted (a flush after leaving): data only, no toasts.
- toast gained an `id` option (sonner replaces a toast with the same id).

DEV: __lesefluss_e2e_remotePosition(bookId, word, updatedAt) lands a position exactly like a pull: buildBookMergeUpdate, then applyBookMerge, then invalidating the book queries (wired in main.tsx; tree-shaken from prod). __lesefluss_e2e_saveFinished counts finished writes (landed, dropped or failed); waitPositionQuiet now waits on it, since a dropped own write never logs a save.

Tests:
- unit (db/__tests__/reader-position-register.test.ts, real SQLite, 4): lands on a seen revision; never replaces a newer pulled row and reports it; lands once the reader has seen the newer revision; a pull and a reader write in either order end with the newest. Red without the guard: 2 fail.
- e2e (position-external.spec.ts, 5), ported from e2e-repro bug 2:
  - idle reader + newer pull: the view moves there with the toast, and neither a visibility nor a back flush writes its own word back;
  - two adopts in a row: one toast, and Undo returns to the word before the first and saves it;
  - RSVP playing + pull: the Go there toast, the reader's word written over theirs, and Go there saves theirs;
  - a followed device position: no toast.
  Red checks: E1 no reaction to the book query (4 fail); E2 never keep local (the RSVP case fails); E3 Undo to the latest (fails); E4 no silent follow (the device case fails).
- e2e-repro/ is deleted: every repro is now ported (206.2 to 206.7).

AC#5, web: the integration suites need DATABASE_URL. I didn't use the dev DB (rsvp) or anything remote. A throwaway database lesefluss_it_2067 was created on the local Postgres (localhost:5432), migrated with drizzle-kit, used for the run, then dropped (verified gone). Sync integration (sync-book/goal/settings-upsert, session-furthest): 31/31. The whole web suite on it: 39 files, 315/315.

Results:
- tsc (app + e2e), biome (pre-existing warnings only);
- vitest: app 1380, core 195;
- full default e2e run 228/228 (6.6 min, E2E_PORT=3101);
- @lowfps 4/4;
- no leftover processes.

Known limits:
- 'no gesture in progress' isn't modelled separately: a gesture is a local move (ticks), so its time already decides.
- A BLE refetch arriving before the device notify would show the adopt toast for a device position; the notify normally comes first.

2026-10-26 lese-planner: review round 1 (3 reviewers): 3 HIGH (a stale-view write during the resume pull silently beats the incoming position; paused read-aloud counts as local-newer and overwrites the other device; non-monotonic stamps under clock skew) + MEDIUM (BLE follow → wrong Go-there after every device write; browse keep/adopt write or corrupt the wrong word; adopt trips the flush_skipped safety net; toasts outlive the reader; web never pulls while open). Planner decisions: no cross-device clock comparison in the decision ('local is newer' = a real local move since the last seed/adopt/landed write, or RSVP/read-aloud actually PLAYING); the decision becomes a pure module with a unit table; stamps max(now, baseRev+1) and a server-side clamp of book updatedAt to server now; web pulls on visibilitychange (throttled). Batch sent to lese-worker.

2026-10-26 review batch (3 HIGH + mediums), lese-worker. Part 1/2: changes.

Structure: the pure pages/reader/external-position.ts has decideExternalPosition(row, state), returning ignore | advance | keep | adopt, plus clampWord. Its table test covers every cell. Module-level state lives in services/position-revisions.ts: the own-revision registry per book, and the missed-position channel. Effects stay in index.tsx (handleExternalPosition, goToWordAsReader).

Rule (planner): no clocks compared. The reader is newer when it has a local move since its last seed or adopt, or RSVP is playing, or read-aloud status is 'playing'.
- markLocalMove skips view-only moves while browsing (the position stays the anchor);
- the new markPlaybackMove (voice words, RSVP playback ticks) sets only userMovedRef;
- browse's own writes (enter, Read from here) count via markPositionMove.
These were needed: with voice ticks or browse scrolls counting, 'paused read-aloud adopts' and 'browse adopt' could never happen.

HIGH-1: applyBookMerge returns { unrouted, skippedPosition }. pullSync calls reportMissedPosition for a skipped position, and the open reader decides on it (isInDb=false: keep writes nothing because the DB already holds ours; adopt writes theirs).
HIGH-2: by the rule above. Adopting while read-aloud is active calls keepsPositionOnMove(theirs). Go there or Undo while read-aloud is active goes through jumpToWord (playing: the voice moves; paused: the reader takes the spot).
HIGH-3: writeReaderPosition stamps nextPositionRevision = max(now, baseRev + 1) and returns the stamp; isWritten compares it. A dropped write sets baseRev = max(row.updatedAt, last landed stamp). Web: bookInsertValues clamps updatedAt and metadataUpdatedAt to min(client, serverNow).

Mediums:
- BLE: updateBook gets an explicit stamp; listeners get (bookId, word, updatedAt) through notifyDevicePosition, now also on the legacy single-book path. followDevicePosition raises baseRev and decidedRev. The DEV devicePosition hook now writes the row like applyDevicePosition, then follows.
- Browse: ours = anchor ?? lastWord, so keep writes the anchor. An adopt while browsing moves only the anchor; Undo and Go there while browsing move the anchor and write.
- Adopt sets seededWordRef and resets hasLocalMove. An advance onto our own word sets persisted and seeded.
- markPositionMove ends Undo (timer, ref, toast).
- The toasts are dismissed on unmount, and onClick is guarded by isMountedRef.
- A dropped write invalidates bookKeys.all.
- publishSaveFinished runs in one outer finally.
- theirs is clamped to the word count.
- commitChapter stamps with its own `now` and records it as an own revision.
- Own stale cache: not reproduced. A reopen shows no toast even with the registry disabled; the loader refetches before the seed. The registry is kept for commitChapter and for a dropped own write whose row is a later own write.
- Web: the new useWebResumeSync pulls on visibilitychange → visible (web build, signed in, at least 30 s since its last run).
- id reset: the route is keyed by id (reader.$id.tsx), so a mount is never reused. The reset effect clears the new refs anyway.

Part 2/2: tests and results.

Tests:
- unit: the decide table (11) + clampWord; register +3 (stamp max, row null, finished_at) + applyBookMerge skippedPosition (2); web: a future-stamped push can't outrank a later one.
- e2e position-external (16):
  - idle adopt with a visibility or back flush: the row stays the pull's (word and revision), no pending;
  - Undo before the first of two adopts; a move ends Undo;
  - page-mode adopt;
  - moved → keep (updatedAt > pull revision) + Go there;
  - RSVP playing → keep (updatedAt > pull revision, the word = the last RSVP save); RSVP paused after playing → adopt;
  - browse idle adopt (only the anchor; Back goes there); browse keep writes the anchor + Go there;
  - the HIGH-1 slow pull (applyAfterNextSave);
  - the lost write (no invalidate, tick, visibility flush);
  - BLE (no invalidate, next move lands, no toast);
  - reopen, no toast;
  - read-aloud paused → adopt, and stop saves no spoken word; read-aloud playing → keep, and Go there restarts the voice there.
- page-mode-turn-after-jump: the BLE-during-slide test now expects the device's word in the row.

Red checks (each fails exactly its test):
- M1 the missed report ignored;
- M2 paused read-aloud counts;
- M3 voice ticks as local moves;
- M4 BLE without raising the base;
- M5 keep writes lastWord;
- M6 adopt moves the view while browsing;
- M7 browse moves count;
- M8 adopt keeps the old seed;
- M9 a move doesn't end Undo;
- M10 RSVP playback counts;
- M12 Go there without the voice;
- U1 no stamp max; U2 skip not reported; web: no clamp.
- Not red: M11 (the registry), the dropped-write base reset (the decision raises the base anyway), the bookKeys invalidate, the finally, the reader-side clamp (clampWord unit only), useWebResumeSync (web build only).

Results:
- tsc (app + e2e + web), biome (pre-existing only);
- vitest: app 1397, core 195;
- web 316/316 on a throwaway local DB (lesefluss_it_2067, dropped, verified);
- e2e full run: 236 passed, 3 failed. The BLE page-mode test was fixed as above, and its spec reran 28/28 (x2). settings-reader-preview and scroll-mode-appearance-anchor (an import-setup timeout, 4.7 GB free) passed alone, 32/32. The full suite was not rerun after the fix.
- position-external 16/16;
- @lowfps 4/4;
- nothing left running.

2026-10-26 lese-planner: verifier round found a HIGH (a landed write never cleared hasLocalMove → the phone kept and overwrote the tablet after any earlier move) → move counter; a landed write with no move since clears it. Planner decision on the skipped (HIGH-1) path: a playback-only landed save with no move since → keep + Go-there toast (no write, no silent ignore); otherwise the normal decision. Clock-ahead device follow-up filed as TASK-212.

2026-10-26 verifier HIGH + follow-ups (lese-worker).

HIGH: hasLocalMove was never cleared by a landed write. Fix: localMoveCountRef counts position moves (markPositionMove). writePosition captures the count when the write is issued; when the write lands with the count unchanged, hasLocalMove clears. So 'local is newer' now means a move since the last landed write or adopt.

MEDIUM, the skipped path (planner decision, option b with KEEP): isPlaybackSaveNewestRef is true when the newest landed write came from RSVP or read-aloud and nothing has moved since; a move or an adopt resets it. The new decide cell isSkippedForPlaybackSave (isInDb=false && isPlaybackSaveNewest) returns keep: no write (the DB holds ours) and the Go there toast. Otherwise the normal rule applies: adopt with no move since the landed write, keep with one. A plain '<= lastLanded → ignore' would have reverted HIGH-1.

LOWs:
- BLE device-ahead writes (multi-book and legacy paths) stamp nextPositionRevision(now, row.updatedAt), and the DEV hook mirrors it;
- goToWordAsReader uses markPositionMove, so Undo and Go there while browsing end the Undo window.

Tests:
- decide table +1 cell;
- e2e position-external now has 17:
  - 'moved and saved → adopt' (flipped from keep; the row stays the pull's);
  - new: 'moved again since the save (unsaved ticks) → keep + Go there';
  - the HIGH-1 slow pull now adopts (no move since the landed save);
  - new: 'read-aloud stopped while looking away + a pull skipped for the voice's save → keep the spoken word (the anchor), not the browsed word; Go there moves the anchor'.
  - The old 'browsing after a move keeps the anchor' is removed: with landed writes clearing the move, it can't be reached (browse's enter writes, and that write lands first). The anchor rule is now covered by the read-aloud test (M5 is red there).
- Red checks:
  - H1, a landed write not clearing the move: 2 fail (the saved-move adopt, the slow pull);
  - P, no playback keep: the read-aloud test fails;
  - M5, keep writing lastWord: the read-aloud test fails.
  - Not red: the counter comparison itself (a move between a write's issue and its landing can't be timed in e2e).

Results:
- tsc (app + e2e), biome (pre-existing only), vitest 1398;
- full default e2e with E2E_WORKERS=2, in thirds (each under 10 min): 65 + 84 + 91 = 240 tests, 238 passed. browse-mode (an import-setup timeout in the first test) and import-folder (a picker click timeout) both passed on rerun (13/13).
- @lowfps 4/4;
- orphaned vite processes on 3101 killed by pid.
- A first attempt fed `ls` output (aliased to a long listing) as spec paths; those runs are discarded.

2026-10-26 lese-planner: accepted. Review round 1 (3 reviewers, 3 HIGH) → pure decide module + fixes; verifier round (1 HIGH: a landed write must clear the local move) → move counter + playback-keep decision. Full suite 238/240 with E2E_WORKERS=2 (the 2 failures were setup timeouts that pass on rerun), @lowfps 4/4, vitest 1398, web 316/316 on a throwaway local DB. Real Chrome pass (dev server :3417, Morning Star, DEV pull hook = real buildBookMergeUpdate + applyBookMerge path): idle adopt shows 'Moved to where you left off on another device · Undo', Undo restored and saved the pre-adopt word; an unsaved local move + pull kept the local word and showed 'Newer position from another device · Go there', Go there saved the remote word. Follow-up: TASK-212 (clock-ahead device).
<!-- SECTION:NOTES:END -->
