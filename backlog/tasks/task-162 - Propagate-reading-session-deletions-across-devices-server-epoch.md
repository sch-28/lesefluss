---
id: TASK-162
title: Propagate reading-session deletions across devices (server epoch)
status: Done
assignee:
  - '@claude'
created_date: '2026-10-26 03:15'
updated_date: '2026-10-28 19:07'
labels: []
milestone: m-13
dependencies: []
documentation:
  - STATS-IMPROVEMENTS.md
priority: medium
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reading sessions have no tombstone column. Deleting one removes it locally and on the server, but any other device still holding the row re-upserts it on its next push, so the deletion silently undoes itself. The same hole applies to the danger-zone "delete reading stats" wipe: `use-danger-zone.ts` already documents it, noting that propagating a wipe needs "a server-side epoch the pull can compare against, which does not exist yet".

TASK-159.4 corrected the user-facing copy so the confirmation dialog no longer promises removal "on every device", which it could not deliver. This task is the actual fix.

Two shapes are worth weighing:

- **Tombstone column**, matching how books and highlights already work in this codebase. Consistent with existing patterns, but sessions are append-only and high-volume, so tombstones accumulate and every device keeps them forever.
- **Server-side deletion epoch**: a per-account timestamp bumped on any session deletion. A client whose last pull predates the epoch discards its local sessions and refetches. Cheaper to store, but coarse — it cannot express a single-row delete without a full resync, so a per-row variant would need a deleted-ids list with its own retention question.

Touches `apps/web` (Postgres schema, migration, sync endpoint) and the capacitor client (pull merge, danger zone). Note the push side is now incremental against a watermark (`sync_sessions_pushed_at`), so any design has to say what happens to that watermark when the server discards rows: resetting it forces a full resend, which is correct but expensive.

Out of scope for the stats work, which is why it is split out rather than folded into TASK-159.4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Deleting a session on one device removes it from every synced device without a manual resync
- [x] #2 The danger-zone stats wipe propagates the same way
- [x] #3 The confirmation copy matches the delivered behaviour
- [x] #4 The push watermark cannot strand rows after the server discards them
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Server: migration 0043 adds sync_reading_sessions.deleted (default false). delete-session / wipe-sessions UPDATE to deleted=true instead of DELETE. Push upsert skips conflicting tombstoned rows (WHERE deleted=false), so no push (old or new client) can revive one; inserts default live.
2. GET /api/sync returns live rows in readingSessions and tombstoned ids in a new optional deletedSessionIds field; old clients ignore it (no local resurrection from rows they never see).
3. Server readers of sessions (profile-stats, discussion-gate) filter deleted=false.
4. Client pull: when syncStats, hard-delete local rows listed in deletedSessionIds (chunked). Absent field (old server) = nothing.
5. Danger zone + per-row delete keep server-first flow; update copy/comments; watermark reasoning in notes.
6. Tests: core schema, client pull tombstone apply (unit), server integration (tombstone sticky vs old/new push, wipe, GET split).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 owner decision: tombstone column (deleted flag on sync_reading_sessions, like books/highlights). Single-row delete tombstones the row; the danger-zone wipe tombstones every row. Premise re-checked at f8d79ba: still valid. Note the incremental push watermark means another device does not re-push old rows; the gap is that deletions never reach other devices' local DBs.

2026-10-28 implementation (lesefluss-worker-2):
- Migration 0043_reading_session_tombstone: sync_reading_sessions.deleted boolean NOT NULL DEFAULT false.
- /api/sync/delete-session and /api/sync/wipe-sessions (wipeReadingStats) now UPDATE deleted=true, updatedAt=now instead of DELETE. Account deletion still hard-deletes.
- POST /api/sync session upsert: ON CONFLICT ... setWhere deleted=false, so a tombstone is frozen; the push never writes the deleted column at all (no field in the push schema). A push of an unknown id inserts live.
- GET /api/sync: readingSessions = live rows only; new optional deletedSessionIds: string[] = tombstoned ids (SyncResponse in core).
- profile-stats and discussion-gate filter deleted=false.
- Client pull (syncStats on): queries.deleteReadingSessions(ids) hard-deletes held rows (select-then-delete, 1000-id chunks, returns count so a pull of already-applied tombstones does not flag changed). Client keeps no local tombstones; the server is the record.
- Copy: danger-zone stats message and single-session dialog now say other signed-in devices drop the session(s) on their next sync.

Compatibility:
- Old client / new server: old clients strip the unknown deletedSessionIds field and never see tombstoned rows in readingSessions, so they cannot read one as live. Their local copies of deleted rows stay (same as before this task, no regression). Their pushes cannot revive a tombstone (setWhere). Their delete/wipe calls hit the same endpoints, which now tombstone, so their deletions do propagate to new clients.
- New client / old server: no deletedSessionIds in the response -> nothing deleted locally; delete/wipe endpoints exist and hard-delete as before. Push payload unchanged.

Watermark (AC4): the server never discards a row a device still holds live except through an explicit user deletion, and that deletion reaches every device's local DB on its next pull, so no live row can be stranded behind sync_sessions_pushed_at. A pull deletion does not move the watermark. The wipe still resets this device's watermark (harmless, nothing left to resend).

Known limits / open:
- Deletion is still online-only (server-first, toast/kept row on failure), as before.
- Sessions another device recorded but had not pushed before a wipe arrive later as live rows (no tombstone exists for them); copy says so. Closing that needs a wipe epoch on startedAt.
- A session whose id is tombstoned while a device is still recording it gets re-created locally by the tracker's checkpoints until the next pull deletes it again; server stays deleted.
- deletedSessionIds grows forever (ids only, never bigger than the live rows it replaced in the full-snapshot pull). Retention/pruning is a follow-up if needed.
- Tests: apps/web/src/lib/session-tombstone.integration.test.ts (5, run against a throwaway migrated DB), apps/capacitor/src/services/sync/__tests__/session-tombstone-sync.test.ts (6), apps/capacitor/src/services/db/__tests__/reading-session-delete.test.ts (3). E2E not run.

2026-10-28 review round 1 fixes:
- Open sitting rotation: pull calls notifySessionsDeleted(ids) (services/reading-sessions/deleted.ts) BEFORE the local delete; useReadingSession subscribes and SessionTracker.forgetDeleted rotates a matching open sitting to a fresh id starting now (pause state kept, time/words reset). Ordering before the delete means a checkpoint issued earlier is queued before the delete statement.
- wipeAllReadingSessions moved to services/sync/index.ts and runs server wipe + local delete under withSyncLock. Push watermark reset dropped: nothing local is left to resend, later rows sort above it.
- delete-session -> tombstoneSession (lib/sync-wipe.ts): INSERT placeholder tombstone (bookId '', mode scroll, zeros) ON CONFLICT set deleted/updatedAt WHERE deleted=false. Every reader skips tombstones, so placeholder columns are never read.
- Incremental tombstones: client key sync_session_tombstones_at (account-scoped, cleared in clearAccountScopedState). GET /api/sync?sessionTombstonesSince=<ms> returns deletedSessionIds with updatedAt > since - 5 min plus deletedSessionIdsAsOf (server time read before the queries). No param (old clients) = both fields omitted. Client advances the key only when it applied the list (syncStats on, asOf present).
- deletedSessionIds parsed with core DeletedSessionIdsSchema (z.array(z.string()).catch([])); deleteReadingSessions is a plain chunked delete.
- Copy: wipe mentions goals; 'devices syncing reading stats'. Docs: agents/capacitor.md, CONTEXT.md, agents/web.md.
- Not done: merging the two GET session queries (the tombstone query has its own since filter and id-only projection).
- Still open: sessions an offline device recorded but never pushed before a wipe arrive later live (no tombstone exists for unknown ids).

2026-10-28 review round 2 fixes:
- Stats wipe covers goals: server wipeReadingStats tombstones goals (deleted=true, updatedAt=now) instead of hard-deleting; client wipeAllReadingStats (renamed) hard-deletes local goals in the same lock and re-syncs reminders. Other devices drop goals through the existing buildGoalMerge tombstone path; an older goal push loses LWW. wipeReadingGoals (stats sync turned off) unchanged.
- Wipe copy names goals and the remaining case (sessions recorded offline and not yet synced still arrive afterwards).
- ListenRecorder.forgetDeleted(ids, now): drops matching sittings and clips all playback before now (the log repeats the running interval from its start); use-read-aloud subscribes and retracts furthest-read for dropped ids.
- SessionTracker.forgetDeleted retracts the deleted sitting's furthest word (onFurthestRead(id, null)), as discard does.
- delete-session rejects sessionId > 64 chars (400).

2026-10-28 planner: 3 reviews + verifier, round-2 fixes accepted; full e2e run 323/331 with no TASK-162-related failures. Web deploy needed (migration 0043) before clients rely on deletedSessionIds; old clients unaffected.
<!-- SECTION:NOTES:END -->
