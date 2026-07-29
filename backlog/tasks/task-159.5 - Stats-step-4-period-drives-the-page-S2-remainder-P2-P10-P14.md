---
id: TASK-159.5
title: 'Stats step 4: period drives the page (S2 remainder, P2, P10, P14)'
status: Done
assignee: []
created_date: '2026-07-28 19:39'
updated_date: '2026-07-29 01:18'
labels: []
milestone: m-7
dependencies:
  - TASK-159.2
documentation:
  - STATS-IMPROVEMENTS.md
modified_files:
  - apps/capacitor/src/services/stats/aggregate.ts
  - apps/capacitor/src/services/stats/__tests__/aggregate.test.ts
  - apps/capacitor/src/services/db/queries/stats.ts
  - apps/capacitor/src/services/db/queries/index.ts
  - apps/capacitor/src/services/db/hooks/query-keys.ts
  - apps/capacitor/src/services/db/hooks/use-stats.ts
  - apps/capacitor/src/services/db/hooks/index.ts
  - apps/capacitor/src/pages/library/stats.tsx
  - apps/capacitor/src/pages/library/stats/period.ts
  - apps/capacitor/src/pages/library/stats/period-totals.tsx
  - apps/capacitor/src/pages/library/stats/wpm-trend.tsx
  - apps/capacitor/src/pages/library/stats/personality.tsx
  - apps/capacitor/src/pages/library/stats/hero.tsx
  - apps/capacitor/src/pages/library/stats/activity-heatmap.tsx
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
- [x] #1 Changing the period updates period totals, top books, the speed trend and the personality callouts
- [x] #2 The speed trend buckets sensibly at every period, from a single day to all time
- [x] #3 The activity heatmap is visually outside the tab group and states its own fixed window
- [x] #4 The today delta compares like with like rather than a partial day against a full one
- [x] #5 The hero cover comes from the shared top-books result, not a second query
- [x] #6 A stats page left open across midnight recomputes today rather than reporting yesterday
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The selected range now drives the hero, period totals, top books, the speed trend and the personality section. The heatmap stays fixed and says so.

**D1 implemented.** `trendBucketsFor` returns hourly buckets for today, daily for 7d and 30d, weekly while all-time history is short, monthly beyond 26 weeks. Every step walks local calendar units, so the keys survive a DST change — the failure mode that previously blanked half the chart. The axis and tooltip derive their labels from the granularity instead of assuming "N weeks ago", with evenly spaced ticks capped at five. For the all-time case the query asks `MIN(startedAt)` first rather than fetching every row to discover the horizon.

D1 offered "per-session or hourly" for today; hourly was chosen because a per-session x-axis has no fixed meaning and its point count varies with how the user reads.

**P3's remainder** came with this: `getHourHistogram` and `getPersonalityStats` finally take a window, which was explicitly deferred here from TASK-159.3.

**P10** fell out for free. The hero ran a duplicate top-books query purely for cover art; now that its number follows the period it shares Top Books' query, and its label reads the period rather than always saying "This week".

**P2** — the comparison window is clipped to the same elapsed offset, so a partial today is measured against the same slice of yesterday. Applied to 7d and 30d too, whose last day is also partial.

**P14** — the locked `now` rolls forward on a visibility change when the local day has moved on.

**Review found four real bugs, one of them introduced by the P2 fix.**

Clipping the comparison window made `prevEnd` an intra-day timestamp, but the `periodTotals` key quantises its end to the local day — so every time of day collapsed onto one cache entry while the query returned different answers. With infinite staleTime, opening the page at 09:00 and again at 21:00 would show the 09:00 comparison. Closed windows now have their own key carrying the exact end.

A spring-forward day has no 02:00 local, and `setHours` folds it onto 03:00, so the hourly list held a duplicate: the chart plotted that hour twice and `averageOver` counted it twice, turning a correct 200 wpm into 167. Deduped.

The trend keyed on the period alone and called `Date.now()` internally, so it was the one section a midnight rollover could not reach. It now takes the page's `now`.

"Today" charted all 24 hours, so at 09:00 the line collapsed to zero across fourteen buckets that had not happened. Stopped at the current hour.

Also from review: removed unused parameter defaults, folded `TrendPeriod` and `Period` into one definition, and cut comments that narrated the change rather than explaining a constraint.

355 tests, tsc clean, biome clean, build clean.
<!-- SECTION:FINAL_SUMMARY:END -->
