---
id: TASK-162
title: Propagate reading-session deletions across devices (server epoch)
status: To Do
assignee: []
created_date: '2026-07-29 00:45'
updated_date: '2026-07-29 00:46'
labels: []
milestone: m-7
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
- [ ] #1 Deleting a session on one device removes it from every synced device without a manual resync
- [ ] #2 The danger-zone stats wipe propagates the same way
- [ ] #3 The confirmation copy matches the delivered behaviour
- [ ] #4 The push watermark cannot strand rows after the server discards them
<!-- AC:END -->
