---
id: TASK-159.4
title: 'Stats step 3: session sync integrity (C7, C9, C10 pull half, C11, C2, C17)'
status: Done
assignee: []
created_date: '2026-07-28 19:39'
updated_date: '2026-07-29 00:58'
labels: []
milestone: m-7
dependencies:
  - TASK-159.1
documentation:
  - STATS-IMPROVEMENTS.md
modified_files:
  - apps/capacitor/src/pages/reader/session-tracker.ts
  - apps/capacitor/src/pages/reader/use-reading-session.ts
  - apps/capacitor/src/pages/reader/__tests__/session-tracker.test.ts
  - apps/capacitor/src/pages/reader/__tests__/session-tracker.property.test.ts
  - apps/capacitor/src/pages/library/session-table.tsx
  - apps/capacitor/src/services/db/queries/reading-sessions.ts
  - apps/capacitor/src/services/db/queries/index.ts
  - apps/capacitor/src/services/db/schema.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/utils/random-id.ts
parent_task_id: TASK-159
priority: high
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Grouped deliberately: these need one coherent decision about tombstones, atomicity and row identity rather than five separate patches.

**Coordinate with the staged push-watermark work first.** At the time of writing there is uncommitted staged work in `apps/capacitor/src/services/sync/index.ts` that adds incremental session push (`getReadingSessionsSince`, a `sync_sessions_pushed_at` watermark, `clipSessionsForPush`, `nextSessionWatermark`) with 13 tests in `services/sync/__tests__/push-selection.test.ts`. It already fixes the push half of C10. Do not redo it. It also changes the severity of C9 below.

**C7 — session deletes do not propagate.** There is no tombstone column. A delete removes the row locally and server-side, but another device still holding it re-upserts on its next push. The confirmation dialog at `session-table.tsx:131` promises removal "on every device", which the system cannot deliver. The team already knows: the staged `use-danger-zone.ts` comment states that propagating a wipe needs a server-side epoch "which does not exist yet". Either build the epoch or correct the dialog copy; do not leave the promise standing.

**C9 — the session upsert is not atomic, and is now permanently damaging.** `apps/capacitor/src/services/db/queries/reading-sessions.ts:35-49` is a SELECT then INSERT-or-UPDATE with an await between, and `persistRow` in `pages/reader/use-reading-session.ts:56-72` is fire-and-forget. Two writers can both see an empty SELECT and both INSERT; one dies into `log.error`. Until now every push resent every session, so a row left with a stale `updatedAt` self-healed on the next push. With incremental push it is never selected again and stays local forever. Fix as a single `onConflictDoUpdate ... WHERE excluded.updated_at > updated_at`.

**C10, pull half.** `services/sync/index.ts:794` loops per row over `data.readingSessions`, the server returns every session with no cap, and the response is consumed via a bare `as SyncResponse` cast with no schema validation.

**C11 — 32-bit session ids collide at the documented scale.** `apps/capacitor/src/utils/random-id.ts` generates 4 random bytes. At the 50,000-row sync cap the birthday probability of at least one collision is roughly 25%, and both the local upsert and the server's `(userId, sessionId)` conflict target treat a collision as the same row, so one sitting silently overwrites an unrelated one.

**C2 — an in-place book switch writes `endWord = 0`.** `pages/reader/index.tsx:276-283` with `use-reading-session.ts:92-105`. The reader is not remounted on `id` change; the reset effect nulls `lastWordRef.current` before the tracker effect calls `finalize()`, so the outgoing session records position 0. This is the series chapter auto-advance path.

**C17 — RSVP sessions can lose their target to a settings race.** `use-reading-session.ts:98` snapshots `wpmSetting` once at tracker construction, so a tracker built before settings resolve stores null for the whole sitting.

Reasoning: `STATS-IMPROVEMENTS.md` section 0.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Deleting a session either propagates to other devices, or the confirmation copy states what actually happens
- [x] #2 Concurrent checkpoint and flush writes for one session cannot lose a write or leave a stale updatedAt
- [ ] #3 A session whose write lost a race is still eventually pushed rather than stranded below the watermark
- [x] #4 Pulling sessions does not scale linearly in bridge round-trips, and the response is schema-validated rather than cast
- [x] #5 Session ids cannot collide at the 50,000-row cap, or a collision is detected rather than silently merging rows
- [x] #6 Switching books in place records the true end position for the outgoing session
- [x] #7 An RSVP session started before settings resolve still records its target
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
C2, C9, C10 (pull half), C11 and C17 closed. C7 split: the false copy is fixed, the propagation itself is TASK-162. C23 and C24 are documented as deliberately unmitigated, with the reasons recorded so the rejected approaches are not rebuilt.

**C9** — `upsertReadingSession` is one `onConflictDoUpdate` with a `WHERE updated_at <` guard. The read-then-write let a heartbeat checkpoint and a terminal flush both see no row and both insert, losing one; since the push watermark advances on `updatedAt`, the stale survivor was never selected again. Review dumped the emitted SQL and confirmed last-write-wins is bit-for-bit the old behaviour, including the equal-timestamp case.

**C2** — `endWord` comes from the tracker's own `lastPos` rather than re-reading the reader, whose position ref is cleared on book switch before the outgoing session finalises. Mutation-checked. Review confirmed `lastPos` is correct on every path into `buildRow`, including jumps and the throttle branch, and that it makes `endWord` consistent with `wordsRead` where the fresh read could exceed the credited spans.

**C17** — the RSVP target is read when the row is written, not captured at construction.

**C11** — session ids widened to 64 bits. Book and series ids stay 8 chars; the sync schema pins those to `^[0-9a-f]{8}$` while `sessionId` is `min(1).max(64)`.

**C10 pull half** — each row validated with the same schema the push and server use, then merged in chunked statements instead of one bridge round-trip per row. Chunk size aligned with the existing `BULK_CHUNK` in `series.ts` and its SQLite-variable-limit rationale.

**Two mitigations were built and then removed on review evidence.**

A quarantine set for rejected session ids could brick sync permanently: `getReadingSessionsByIds` binds one variable per id, unchunked, from a list bounded only by the 50,000-row session cap — above SQLite's 32,766 variable limit. Past that it throws before the payload is built, so the list can never shrink and every later push fails at the same line, in exactly the scenario the feature existed for. It was also redundant: `resetSessionPushWatermark()` already exists as the documented lever for re-offering every local session after a schema loosening.

Clipping the other payload arrays to their caps traded a loud failure for silent permanent data loss. Those arrays are full snapshots with no watermark, and `getAllHighlights` / `getSeriesForSync` have no `ORDER BY`, so a rowid scan plus `slice(0, cap)` kept the oldest rows and dropped the newest — a heavy annotator's recent highlights would never sync, and a `deleted` tombstone beyond the cap would resurrect a deleted highlight elsewhere. It also recorded clipped books as content-uploaded, so their bodies would never be sent. The caps are not the binding limit anyway; the schema says the proxy body limit is.

Both are written up in STATS-IMPROVEMENTS.md under C23 and C24 with the evidence, and the real fix for C24 is named: per-row rejection results from the server rather than whole-payload 400s.

**Acceptance criterion #3 not met.** A session whose write lost a race is no longer possible (C9 makes the write atomic), but a row the server rejects is still stranded rather than retried. That is C23, and the quarantine was the wrong answer.

**Untested:** `upsertReadingSessions` and the pull-side validation. This repo has no database-query test harness at all, so covering them means new infrastructure rather than a test.

339 tests, tsc clean, biome clean, build clean.
<!-- SECTION:FINAL_SUMMARY:END -->
