---
id: TASK-159.5
title: 'Stats step 4: period drives the page (S2 remainder, P2, P10, P14)'
status: To Do
assignee: []
created_date: '2026-07-28 19:39'
updated_date: '2026-07-28 19:40'
labels: []
milestone: m-7
dependencies:
  - TASK-159.2
documentation:
  - STATS-IMPROVEMENTS.md
parent_task_id: TASK-159
priority: medium
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Completes the period rework begun in TASK-159.2, which lifted the state and wired Top Books only. Blocked on decision D1 in `STATS-IMPROVEMENTS.md` section 3.

**S2 remainder.** Six sections currently pick six different windows. Per decision D4, the period drives period totals, top books, the speed trend and the personality callouts. The activity heatmap stays a fixed 90-day calendar and is exempted visually from the tab group rather than silently ignoring it; it is already labelled at `stats/activity-heatmap.tsx:32`.

Query work this requires:
- `getWeeklyWpm` hardcodes 12 weekly buckets in the component (`stats/wpm-trend.tsx:32`, echoed in copy at `:107` and tick maths at `:158-162`), not in the page. Threading the period means editing that component. Per D1 the bucket strategy is per-session for today, daily for 7d and 30d, weekly for all time up to a cap, then monthly.
- `getHourHistogram` and `getPersonalityStats` take no window parameter at all.

**P2 — today is compared against a full yesterday.** `stats/period-totals.tsx:24` sets the previous window to all of yesterday while the current window is today so far, so the delta arrow is red for most of the day regardless of how the user is doing. Compare against the same elapsed slice. Check whether the same reasoning applies to 7d and 30d, whose last day is also partial.

**P10 — the hero runs its own duplicate query.** `stats.tsx:31` calls `useStatsTopBooks(weekWindow.start, 1)` purely for a cover image while `top-books.tsx:14-15` runs `useStatsTopBooks(now - 30d, 5)`. Two cache entries for overlapping data; once the period is lifted the hero reads the shared result.

**P14 — the locked `now` goes stale across midnight.** `stats.tsx:20` locks it for the page lifetime to keep query keys stable, so a page left open overnight keeps computing "today" against yesterday. Note the cache half of this is C20, handled in TASK-159.3.

Reasoning: `STATS-IMPROVEMENTS.md` S2, P2, P10, P14 and decisions D1 and D4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Changing the period updates period totals, top books, the speed trend and the personality callouts
- [ ] #2 The speed trend buckets sensibly at every period, from a single day to all time
- [ ] #3 The activity heatmap is visually outside the tab group and states its own fixed window
- [ ] #4 The today delta compares like with like rather than a partial day against a full one
- [ ] #5 The hero cover comes from the shared top-books result, not a second query
- [ ] #6 A stats page left open across midnight recomputes today rather than reporting yesterday
<!-- AC:END -->
