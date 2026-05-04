---
id: TASK-129
title: 'Coalesce reading sessions per sitting (heartbeat = checkpoint, not split)'
status: To Do
assignee: []
created_date: '2026-05-04 10:57'
labels: []
milestone: m-7
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem

`useReadingSession` (apps/capacitor/src/pages/reader/use-reading-session.ts) flushes the active session every 5 minutes for crash safety and immediately starts a new one. A 2h sitting therefore produces ~24 rows in `reading_sessions`. Word-weighted aggregates (weekly WPM, per-book avg WPM) are unaffected because words and active time recombine cleanly across chunks. But several things break:

- `getPersonalityStats.longestSessionMs` (services/db/queries/stats.ts) caps at 5 min — a 2h sitting reports as 5 min.
- `getPersonalityStats.fastestWpm = MAX(wpmAvg)` skews high for scroll/page because shorter windows have higher variance.
- `totalSessions` is inflated ~6× per long sitting.
- The Sessions list on the book detail page is cluttered with adjacent 5-min rows from one sitting.

## Approach

Keep one session row per sitting. The 5-min heartbeat becomes a **checkpoint** that updates the existing row in place (same `id`) instead of starting a new one. Crash safety unchanged — worst case loses ≤5 min of an unflushed checkpoint. Sync semantics (LWW on `updatedAt`) already support in-place updates, so no schema or sync-layer changes are needed.

Reuse the existing `queries.upsertReadingSession` (services/db/queries/reading-sessions.ts:35) — already does LWW on `updatedAt`, exactly what we want.

## Implementation outline

In `use-reading-session.ts`:

1. Add a stable `id` to `SessionState`, generated once in `startSession`, so checkpoint and final flush write to the same row.
2. Refactor write path into `buildRow` + `checkpoint` (in-place upsert, does NOT clear sessionRef or reset accumulators) + `flush` (terminal, caller clears sessionRef).
3. In the poll interval `HEARTBEAT_MS` branch: replace `flush + startSession` with a single `checkpoint(s)` call. Accumulators and timestamps keep accumulating.
4. 60s idle branch, unmount, mode/book change all stay terminal `flush` paths.
5. Visibility-hidden continues to only pause active accounting.
6. Switch import from `addReadingSession` to `upsertReadingSession`.
7. Update the file's header comment block to describe the new heartbeat semantics.

## Edge cases

- First checkpoint below noise floor (`< 5s` active or `< 5 words`): `buildRow` returns null, no row written, session keeps running. Next checkpoint or terminal flush writes once thresholds are crossed.
- Sitting crossing local midnight: now produces one row attributed to the start day via `startedAt`. `getStreak` already buckets by `startedAt` so the start day still gets credit; the end day does not. Acceptable trade-off vs the splitting approach.
- For scroll/page, `wpmAvg` is recomputed each checkpoint from cumulative words/active-minutes, so a long sitting smooths toward its true rate (minor improvement).

## Out of scope

- Migrating existing split rows. Old data stays as-is; only new sittings produce single rows.
- Any change to web Postgres schema or sync handler — the existing `(userId, sessionId)` upsert with LWW on `updated_at` already handles in-place updates.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Long sittings produce a single `reading_sessions` row regardless of duration (verified by reading >10 min and inspecting local SQLite)
- [ ] #2 `getPersonalityStats.longestSessionMs` reflects the true sitting length, not the 5-min heartbeat window
- [ ] #3 `getPersonalityStats.totalSessions` reflects sittings, not chunks
- [ ] #4 Cross-device sync still converges: row updated on device A appears with the latest `endedAt`/`durationMs` on device B after sync (LWW on `updatedAt`)
- [ ] #5 No regression in weekly WPM or per-book avg WPM aggregates for past data
- [ ] #6 Sessions list on the book detail page shows one row per sitting instead of N adjacent 5-min rows
- [ ] #7 File header comment in `use-reading-session.ts` updated to describe checkpoint (not split) heartbeat semantics
<!-- AC:END -->
