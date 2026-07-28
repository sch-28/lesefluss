---
id: TASK-159.3
title: >-
  Stats step 2: remaining aggregation defects (C3, C5, C12, C14, C15, C16, C19,
  C20, C18, P3)
status: To Do
assignee: []
created_date: '2026-07-28 19:38'
updated_date: '2026-07-28 20:23'
labels: []
milestone: m-7
dependencies:
  - TASK-159.1
documentation:
  - STATS-IMPROVEMENTS.md
parent_task_id: TASK-159
priority: medium
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The rest of the correctness list, none of which corrupts stored data but all of which misreports it. Grouped because they are the same file and the same class of thinking.

**C3 — longest streak collapses to 1 west of UTC.** `apps/capacitor/src/services/db/queries/stats.ts:135` calls `new Date(key)` on a `YYYY-MM-DD` string, which the spec parses as UTC midnight. In a negative-offset timezone that lands on the previous local day, so the adjacency test at `:136` never matches. `Math.max(longest, current)` at `:142` partly masks it, which is why it looks plausible from Europe.

**C5 — the 90-day heatmap duplicates one day and drops another across DST.** `stats.ts:104-112` walks a fixed-millisecond grid and then calls `localDateKey`. `date-utils.ts` already exports `previousLocalDayStart` for exactly this and is not used here. `stats/period-totals.tsx:23-37` and `stats.tsx:25` compute window starts the same unsafe way.

**C12 — web-novel chapters count as books finished.** `stats.ts:36-49` filters on `deleted` and the 95% threshold but never on `seriesId`, so finishing forty chapters of a serial reads as forty books finished.

**C14 — one session row shows two contradictory word figures.** `stats/../session-table.tsx:169` derives its percentage from `endWord - startWord` while `:201` prints `wordsRead`, which is `maxPos - startPos`. After any backward movement these disagree, rendering as "0% · 900 words".

**C15 — deleted books silently shrink Top Books.** `stats.ts:188-200` applies `LIMIT 5` before filtering deleted books, so deleting your top book leaves a four-card carousel. That time still counts in `getPeriodTotals`, which has no book join, so the two panels disagree by construction.

**C16 — whole sessions land on their start hour.** `stats.ts:300-302` puts a 22:30-to-00:15 sitting entirely on hour 22. Every daily metric buckets by `startedAt` and shares the problem.

**C19 — small totals round up.** `book-stats-card.tsx:41` wraps in `Math.max(1, ...)`, so twenty seconds reads as a minute.

**C20 and C18 — the page fetches far more than it shows, and caches none of it.** `stats.tsx:20` mints a fresh `now` per visit and `services/db/hooks/query-keys.ts` embeds it in the `periodTotals` and `topBooks` keys, so with `staleTime` and `gcTime` at Infinity every visit misses and every dead entry is retained. Separately `session-table.tsx:45` calls `getAllReadingSessions()`, pulling every column of every session ever recorded across the Capacitor bridge to render twenty rows, on the stats page and on every book detail page.

**P3 — the unbounded scans.** `getStreak` (`stats.ts:86-92`), `getHourHistogram` (`:291-296`) and `getPersonalityStats` (`:314-320`) each select every session row with no window.

Reasoning: `STATS-IMPROVEMENTS.md` section 0 and P3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Longest streak is correct when the device timezone is west of UTC
- [ ] #2 The 90-day heatmap contains exactly 90 distinct local dates across a DST transition
- [ ] #3 Books finished excludes series chapter rows
- [ ] #4 A session row's percentage and word count agree, or the row explains why they differ
- [ ] #5 Top Books returns the requested number of non-deleted books, and its total agrees with the period totals
- [ ] #6 A session spanning midnight distributes its time across the hours it actually covers
- [ ] #7 Sub-minute totals render honestly rather than rounding up to 1m
- [ ] #8 Revisiting the stats page reuses cached queries instead of missing on a fresh key each time
- [ ] #9 The session list fetches only the rows it renders
- [ ] #10 getStreak, getHourHistogram and getPersonalityStats no longer scan the full table unbounded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
C3 and C5 were fixed early, in TASK-159.1. Extracting the pure date maths into `queries/stats-aggregate.ts` to make C4 and C6 testable resolved both as a side effect: longest-streak no longer reparses 'YYYY-MM-DD' (which JS reads as UTC midnight), and the 90-day window steps in local days. Both are covered by `queries/__tests__/stats-aggregate.test.ts` under a negative-UTC-offset timezone and across both DST transitions.

This task only needs to verify them, not fix them. The remaining items are unchanged: C12, C14, C15, C16, C19, C20, C18, P3.
<!-- SECTION:NOTES:END -->
