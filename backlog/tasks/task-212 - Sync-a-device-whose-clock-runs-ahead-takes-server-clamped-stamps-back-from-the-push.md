---
id: TASK-212
title: >-
  Sync: a device whose clock runs ahead takes server-clamped stamps back from
  the push
status: To Do
assignee: []
created_date: '2026-10-26 03:15'
labels:
  - sync
  - bug
milestone: m-14
dependencies: []
priority: low
ordinal: 185000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the TASK-206.7 verification. The server now clamps a pushed book's updatedAt / metadataUpdatedAt to its own clock (apps/web sync-book-upsert). The clamp doesn't help the device whose clock is ahead: it keeps its local future stamp S, so for the whole skew window it ignores every other device's row with T < S (the merge only applies newer rows), and its next save, clamped to server now, can overwrite theirs. This predates TASK-206.7.

Fix options: return the clamped stamps in the push response and rewrite the local updatedAt (no revision bump); or keep a server-time offset from response Date headers and stamp with it.
<!-- SECTION:DESCRIPTION:END -->
