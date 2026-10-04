---
id: TASK-192
title: >-
  Synced books arrive with no lastRead, so a new device has no recent order and
  no auto-open
status: Done
assignee: []
created_date: '2026-10-04 01:07'
updated_date: '2026-10-04 01:58'
labels:
  - sync
  - app
milestone: m-13
dependencies: []
references:
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/services/db/queries/last-read.ts
  - backlog/tasks/task-50 - Auto-open-last-book-on-app-launch.md
modified_files:
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/services/sync/__tests__/book-merge.test.ts
priority: medium
ordinal: 147000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found on 2026-10-04 while verifying TASK-50 on the Boox Nova Air 2 (signed in, library synced from the server). All 14 local books had `last_read = NULL`, so "Open last book on launch" found nothing and fell back to the library, and the library's recency order (`getBooks` orders by `lastRead desc`) carries no information.

Cause: `apps/capacitor/src/services/sync/index.ts` creates a local row from a server book with `lastRead: null` (around line 360). `buildBookMergeUpdate` only sets `lastRead` when the server position is newer than the local one. So a device that pulls a library it never read on keeps NULL until the user moves the position there.

The server already holds a usable signal: the row's position stamp (`positionUpdatedAt` / `updatedAt`, migration 0017). Seeding `lastRead` from it for books with a position > 0 would give a fresh device the same "continue reading" order as the device the reading happened on.

Check before changing: whether `lastRead` is pushed to the server at all (if not, the seed is local-only and safe), how chapter rows (`commitChapter` stamps lastRead on fetch) should behave, and that the seed never moves a local value backwards.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A book pulled from the server with a position > 0 gets a local lastRead from the server's position timestamp; one without progress stays NULL
- [x] #2 A pulled book never moves an existing local lastRead backwards
- [x] #3 On a freshly signed-in device, Open last book on launch opens the book most recently read on any device, and the library's recent order matches
- [x] #4 Unit tests cover the create and merge paths
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented 2026-10-04. `seededLastRead(serverBook)` (server updatedAt when wordPosition > 0) seeds new rows in buildBookRowFromServer; `lastReadBackfill(local, serverBook, merge)` fills rows pulled earlier with a device-local updateBook (isDeviceLocal: no updated_at/metadata stamp, never overwrites an existing lastRead, skipped when the merge sets one). The server returns every book's metadata on each pull, so existing installs are repaired on their next sync. lastRead is not in the sync payload, so nothing is pushed. Verified on the Boox: after one sync 12 of 14 books got last_read == server updatedAt (the two at position 0 stayed NULL), updated_at unchanged, Phoenix on top; with a last_read present auto-open opens that book (checked in the TASK-50 device run). Tests: book-merge.test.ts (seededLastRead, lastReadBackfill incl. metadata-only merge). Reviewed by an agent: all lastRead consumers checked (library sort, personal picks, chapter list, series entry, stats/finishedAt backfill, push filter, pending-position recovery); only residual risk is cross-device clock skew against an unsaved pending position, which the existing merge path already has. No pullSync-level test exists; the loop wiring was verified on device.

Same review round, related fixes: share-intent-handler replaces '/' on a cold-start share (back used to need two presses to exit), navigateToLink uses router.history.canGoBack() instead of window.history.length (tests adapted), hardware-back test rewritten with a real memory history plus overlay case. Capacitor unit 1038, tsc clean, full e2e 137 passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Books synced to a device now get a local lastRead from the server's position timestamp when they have progress, both on first pull and as a one-time device-local backfill for rows pulled earlier. A freshly signed-in device gets the same recent order and auto-open target as the device the reading happened on.
<!-- SECTION:FINAL_SUMMARY:END -->
