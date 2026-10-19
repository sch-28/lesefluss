---
id: TASK-199
title: >-
  Reading goals per book: finish-by deadline or daily pace, with on-track
  tracking
status: Done
assignee: []
created_date: '2026-10-19 19:23'
updated_date: '2026-10-19 20:15'
labels:
  - feature
  - stats
dependencies: []
references:
  - apps/capacitor/src/services/stats/book-summary.ts
  - apps/capacitor/src/utils/reading-time.ts
  - apps/capacitor/src/pages/library/book-stats-card.tsx
  - apps/capacitor/src/services/db/queries/stats.ts
priority: medium
ordinal: 155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Let a reader set a goal for one book so a long book feels manageable ("only 0.6% a day") or so they finish by a date that matters (a film release, a book-club meeting). The app shows the daily target, whether the reader is ahead or behind the plan, and the projected finish date, using the reading speed and session data the app already collects.

Decisions already made with the product owner (do not re-open without asking):
- One goal model covers two modes. Deadline mode: the target date is fixed and the daily target is recalculated (remaining % / days left), so missed days raise the daily target. Pace mode: the daily % is fixed and the finish date moves when days are missed. The mode (`onMiss`: raise daily target vs push finish date) is chosen per goal and can be switched at any time.
- Primary unit is percent of the book, shown with one decimal (long plans need values like 0.55%/day), plus a time estimate at the reader's pace, e.g. "2.0% · ~20 min".
- Progress is measured by position (word position), not by time read. Skipping ahead counts.
- Today's target is fixed at the start of the local day from the start-of-day position, so it does not shrink while reading.
- Ahead/behind is measured against the original straight line from goal start to target date and shown as plain numbers (e.g. "+1.4 days", "−3.2%"). No motivational or long-prose wording: stats and short labels only, like the existing book stats card.
- Two per-book counters, separate from the global streak: days the daily target was met, and days the book was read at all.
- Serial (web novel) books are out of scope for v1.
- Goals sync across devices, and work fully for no-account users (local database first).

Subtasks: data model + plan logic + sync, UI (preceded by HTML mockups to choose from), optional reminders, buddy-read deadlines.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-19: all subtasks 199.1-199.5 Done (199.3 device-tested on Pixel 8 Pro). Ship 199.1-199.5 in one release: local migrations 0038-0040, server migrations 0036-0038, goal + session sync schema changes, new POST /api/sync/wipe-goals. Out of scope: serial books (v1), past days read only on a paired device (user: leave).
<!-- SECTION:NOTES:END -->
