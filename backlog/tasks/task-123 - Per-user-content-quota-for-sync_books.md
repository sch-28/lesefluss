---
id: TASK-123
title: Per-user content quota for sync_books
status: To Do
assignee: []
created_date: '2026-05-01 15:39'
labels: []
milestone: m-9
dependencies: []
ordinal: 2100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today neither `POST /api/sync` nor the new `POST /api/import/article` enforce a per-user storage cap on `sync_books.content`. With the browser extension landing (TASK-86), authenticated users can submit rendered HTML of up to 5MB per request at 20 req/min, persisting indefinitely. Rate limiting alone doesn't bound total storage.

Scope:
- Decide a per-user cap (suggested: total `SUM(file_size)` across non-deleted `sync_books` rows for the user, e.g. 500MB).
- Enforce on both write paths: sync push (existing) and `/api/import/article` (new).
- Return 413 with a clear error when the cap would be exceeded.
- Optional: surface remaining quota in the sync pull response so clients can warn users proactively.

Out of scope: paid tiers / quota uplift. This is just a sane default cap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A documented per-user cap on total stored content size for non-deleted sync_books
- [ ] #2 Cap enforced on `POST /api/sync` book upserts (returns 413 on exceed)
- [ ] #3 Cap enforced on `POST /api/import/article` (returns 413 on exceed)
- [ ] #4 Tests cover the at-cap and over-cap cases for both endpoints
<!-- AC:END -->
