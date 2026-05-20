---
id: TASK-137
title: 'Release N+1: drop byte-position columns and legacy sync fields (app + web)'
status: To Do
assignee: []
created_date: '2026-05-20 19:40'
labels:
  - refactor
  - word-index
  - migration
  - cleanup
dependencies:
  - TASK-136
references:
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
documentation:
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
priority: medium
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cleanup task. Held until Release N has baked in the wild for at least one app release cycle so a rollback path (re-reading byte columns) is still possible during that window.

App-side (apps/capacitor/drizzle/0026_*.sql + meta/_journal.json):
- `books`: drop `position`, drop `position_unit` (every book is word at this point).
- `highlights`: drop `start_offset`, `end_offset`.
- `reading_sessions`: drop `start_pos`, `end_pos`.
- `book_content.chapters` JSON: chapter entries no longer carry `startByte`. Run a one-time JSON rewrite to strip it from existing rows.
- Update apps/capacitor/src/services/db/schema.ts accordingly.

Web-side (apps/web/drizzle migration):
- Drop the matching byte columns on `sync_books`, `sync_highlights`, `sync_reading_sessions`.
- Update apps/web/src/db/schema.ts.

Client + server sync changes (apps/capacitor/src/services/sync/index.ts, apps/web/src/routes/api/sync.ts):
- Upload payload no longer ships byte fields. Sync schema drops them.
- Server rejects uploads that contain only byte fields. Min-app-version gate enforced at this point.

Pre-release checks before merging:
- Backfill telemetry confirms ~all active installs have flipped to `position_unit = 'word'`. Any stragglers will be force-migrated by Release N+1's own startup logic (still safe because backfill is idempotent and Release N+1 ships with TASK-132's WordIndex module).
- Cloud sync analytics confirm new-shape upload volume dominates byte-shape upload volume across user agents.

Reference: ADR-0002 "Release N+1 (cleanup)" section.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 apps/capacitor drizzle 0026 drops books.position, books.position_unit, highlights.start_offset, highlights.end_offset, reading_sessions.start_pos, reading_sessions.end_pos, and rewrites chapter JSON to remove startByte
- [ ] #2 apps/web drizzle migration drops the matching server byte columns
- [ ] #3 Both schema.ts files reflect the dropped columns
- [ ] #4 Sync payload schema (zod / types) no longer accepts byte fields on upload
- [ ] #5 Server rejects uploads with byte-only payloads (force-update gate active)
- [ ] #6 Pre-merge telemetry checklist documented: position_unit='word' coverage threshold, byte-shape upload volume threshold
- [ ] #7 Backfill code path retained (idempotent safety net) so a fresh install that somehow lands on a legacy backup still converts on first run
<!-- AC:END -->
