---
id: TASK-46.1
title: 'Reading sessions: schema, tracking, sync wire'
status: Done
assignee: []
created_date: '2026-04-30 23:30'
updated_date: '2026-05-01 15:36'
labels: []
milestone: m-5
dependencies: []
parent_task_id: TASK-46
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Foundation for reading statistics. Adds the session table, hooks the in-app readers to log sessions, and wires the rows through cloud sync the same way highlights/glossary already are. No UI surface yet — that's task-119/120.

## Schema

New table `reading_sessions` in `apps/capacitor/src/services/db/schema.ts`:

| column | type | notes |
|---|---|---|
| `id` | text PK | random hex, generated client-side |
| `book_id` | text | FK to `books.id`; keep the row even if book is deleted (for all-time totals) — store the id, don't enforce cascade |
| `mode` | text | `'rsvp'` \| `'scroll'` |
| `started_at` | int | epoch ms |
| `ended_at` | int | epoch ms |
| `duration_ms` | int | denormalized; `ended_at - started_at` minus paused time (visibility-hidden gaps) |
| `words_read` | int | derived per mode (see below) |
| `start_pos` | int | byte offset at session start |
| `end_pos` | int | byte offset at session end |
| `wpm_avg` | int \| null | rsvp only; null for scroll |
| `updated_at` | int | for last-write-wins |

Drizzle migration `apps/capacitor/drizzle/0022_reading_sessions.sql` + `meta/_journal.json` entry.

Mirror in `apps/web/src/db/schema.ts` (Postgres) + matching web migration. Cap server-side rows per user at e.g. 50 000 to bound payload size; oldest-first pruning is fine and can be a follow-up if it ever becomes real.

## Tracking

A `useReadingSession({ bookId, mode })` hook in `apps/capacitor/src/hooks/` (or co-locate in reader). Behavior:

- Start a session on reader mount once the user has actually advanced (don't log a session if they bounce within 3 seconds without progress — kills the noise).
- Pause on `document.visibilitychange === 'hidden'` and on reader pause/menu-open. Resume on visible/play. Accumulate paused time; subtract from duration.
- Flush on unmount, on explicit pause that exceeds 60s, or every 5 minutes as a heartbeat (so a crash loses at most 5 minutes of credit).
- Words-read:
  - **RSVP**: counter from the engine (already increments per word).
  - **Scroll**: `wordsBetweenOffsets(content, start_pos, end_pos)` — split by whitespace on the slice. Cheap.
- Discard sessions with `duration_ms < 5000` or `words_read < 5` at flush time.

## Sync

- Add `SyncReadingSessionSchema` + `readingSessions: z.array(...).max(50000).optional().default([])` to `packages/core/src/sync.ts`.
- Push side (`apps/capacitor/src/services/sync/index.ts`): collect rows, send them. Last-write-wins per `id` using `updated_at`. Tombstones not needed in v1 — sessions are append-only, never edited or deleted from UI.
- Pull side: insert-or-update by `id`, taking the row with the higher `updated_at`.
- Web API (`apps/web/src/routes/api/sync.ts`): mirror the highlights handler.
- Gate push and merge on the `syncStats` toggle once task-118 lands. If 117 ships first, default behavior is "always sync" until the toggle is added — that's fine.

## Out of scope

- ESP32 sessions (no clock, would double-count via position sync).
- Stats UI / queries (task-119, task-120).
- Sync toggle UI (task-118).
- Server-side rollups / analytics (this is local-first; the server is dumb storage).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `reading_sessions` table exists in capacitor SQLite schema with the columns listed in the description and a Drizzle migration
- [x] #2 Web Postgres schema mirrors the table with a matching migration
- [x] #3 `useReadingSession` (or equivalent) logs sessions from both the in-app RSVP reader and the scroll reader, with pause-on-hidden, periodic heartbeat flush, and noise filtering (<5s or <5 words discarded)
- [x] #4 `SyncReadingSessionSchema` is added to `packages/core/src/sync.ts` with a sensible array cap
- [x] #5 Push and pull merge sessions with last-write-wins on `updated_at`
- [x] #6 ESP32 reading does NOT create session rows
- [x] #7 Manual end-to-end test: read a book on two devices signed into the same account; session rows from device A appear on device B after sync
<!-- AC:END -->
