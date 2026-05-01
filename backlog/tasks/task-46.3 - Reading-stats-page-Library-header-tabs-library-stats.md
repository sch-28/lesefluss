---
id: TASK-46.3
title: Reading stats page (Library header + /tabs/library/stats)
status: To Do
assignee: []
created_date: '2026-04-30 23:30'
updated_date: '2026-04-30 23:31'
labels: []
milestone: m-5
dependencies:
  - TASK-46.1
parent_task_id: TASK-46
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User-facing stats dashboard. Depends on task-46.1 (session schema + tracking) being merged; queries the `reading_sessions` table.

## Entry point

Add a small chart icon (e.g. `barChartOutline` from ionicons) to the Library page header (`apps/capacitor/src/pages/library.tsx`), positioned in `IonButtons slot="end"`. Tap routes to `/tabs/library/stats`. Register the route in `apps/capacitor/src/App.tsx` next to the existing library sub-routes, and add the path to the sub-page predicate so the tab bar hides correctly.

## Page contents (v1)

`apps/capacitor/src/pages/library/stats.tsx`. Sections, top to bottom:

1. **Period totals** — segmented control (Today / 7d / 30d / All time). Show: minutes read, words read, books finished. Big numbers, three-up grid.
2. **Streak** — current streak + longest streak. Day = ≥1 minute of reading. A row of dots for the last 14 days, filled or empty, is enough; skip the calendar grid for v1.
3. **Top books this month** — top 5 by total `duration_ms` in the trailing 30 days, joined to `books` for title/author/cover. Tappable, routes to book detail.
4. **WPM trend** — line chart of weekly average WPM across the last ~12 weeks, RSVP sessions only. Empty state: "Read in RSVP mode to see your WPM trend." Use whatever the existing chart story is; if there's no chart lib, a simple SVG sparkline is fine — don't pull in a new dep.

## Queries

Add to `apps/capacitor/src/services/db/queries/`. Suggested file: `stats.ts`. Functions return plain aggregates:
- `getPeriodTotals(periodStart: number)` → `{ minutes, words, booksFinished }`
- `getStreak()` → `{ current: number, longest: number, last14: boolean[] }`
- `getTopBooks({ since, limit })` → `Array<{ bookId, title, author, durationMs, cover? }>`
- `getWeeklyWpm({ weeks })` → `Array<{ weekStart: number, avgWpm: number }>`

"Books finished" = books whose `position` reached end-of-content during the period. Cheapest signal: a book with `lastRead` in period AND `position >= size - epsilon`. Good enough for v1.

## Empty states

If there are no sessions yet, the page should show a single friendly empty state ("Read a book to start tracking your stats") instead of zeroed-out cards. Use total session count as the gate.

## Out of scope

- Time-of-day heatmap, genres, per-chapter breakdowns
- Yearly "Wrapped"-style recap (separate task when we want it)
- Sharing / export of the stats page</description>
<acceptanceCriteria>["Library header has a stats icon in `slot=\"end\"` that routes to `/tabs/library/stats`", "Route is registered and the tab bar hides on the stats page like other sub-pages", "Period totals (Today / 7d / 30d / All time) render correct numbers from session rows", "Current and longest streaks compute correctly across day boundaries (timezone = device local)", "Top books this month lists up to 5 books, sorted by duration, tappable to book detail", "WPM trend renders only when there is at least one RSVP session; otherwise shows the empty-state copy", "Whole-page empty state is shown when zero sessions exist", "All queries live in `apps/capacitor/src/services/db/queries/stats.ts`"]
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Library header has a stats icon in `slot="end"` that routes to `/tabs/library/stats`
- [ ] #2 Route is registered and the tab bar hides on the stats page like other sub-pages
- [ ] #3 Period totals (Today / 7d / 30d / All time) render correct numbers from session rows
- [ ] #4 Current and longest streaks compute correctly across day boundaries (timezone = device local)
- [ ] #5 Top books this month lists up to 5 books, sorted by duration, tappable to book detail
- [ ] #6 WPM trend renders only when there is at least one RSVP session; otherwise shows the empty-state copy
- [ ] #7 Whole-page empty state is shown when zero sessions exist
- [ ] #8 All queries live in `apps/capacitor/src/services/db/queries/stats.ts`
<!-- AC:END -->
