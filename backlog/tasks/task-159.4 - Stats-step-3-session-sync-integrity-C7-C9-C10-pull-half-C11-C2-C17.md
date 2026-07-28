---
id: TASK-159.4
title: 'Stats step 3: session sync integrity (C7, C9, C10 pull half, C11, C2, C17)'
status: To Do
assignee: []
created_date: '2026-07-28 19:39'
updated_date: '2026-07-28 19:40'
labels: []
milestone: m-7
dependencies:
  - TASK-159.1
documentation:
  - STATS-IMPROVEMENTS.md
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
- [ ] #1 Deleting a session either propagates to other devices, or the confirmation copy states what actually happens
- [ ] #2 Concurrent checkpoint and flush writes for one session cannot lose a write or leave a stale updatedAt
- [ ] #3 A session whose write lost a race is still eventually pushed rather than stranded below the watermark
- [ ] #4 Pulling sessions does not scale linearly in bridge round-trips, and the response is schema-validated rather than cast
- [ ] #5 Session ids cannot collide at the 50,000-row cap, or a collision is detected rather than silently merging rows
- [ ] #6 Switching books in place records the true end position for the outgoing session
- [ ] #7 An RSVP session started before settings resolve still records its target
<!-- AC:END -->
