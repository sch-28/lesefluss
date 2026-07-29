---
id: TASK-159.7
title: 'Stats step 6: book detail speed chart, bucketing and axes (B3)'
status: Done
assignee: []
created_date: '2026-07-28 19:39'
updated_date: '2026-07-29 22:35'
labels: []
milestone: m-7
dependencies:
  - TASK-159.1
documentation:
  - STATS-IMPROVEMENTS.md
parent_task_id: TASK-159
priority: low
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The per-book speed sparkline is unreadable past a handful of sessions. Four causes, all in `apps/capacitor/src/pages/library/book-stats-card.tsx`:

1. `:24` maps `x: i`, the session index, so a year of reading and one busy weekend draw identically.
2. `:74-75` sets `enablePointLabel` with `pointLabel="data.y"`, so every point prints its value and they collide.
3. `:85` sets `isInteractive={false}`, so there is no tooltip to recover the detail those labels were attempting.
4. `:77-80` disables both axes and both grids, leaving no frame of reference.

**Resolve the series definition first, it decides what is being plotted.** `services/db/queries/stats.ts:395-397` pushes every row with a non-null `wpmAvg` into `speedSeries` regardless of mode, and the chart draws them as one line in one colour. Those values mean different things: a 400 from an RSVP dial beside a 250 measured from scrolling. Averaging them inside a bucket produces a figure that means nothing. Either filter to one mode or plot delivered rate uniformly.

**Bucket by time, not by session count.** Merging every N sessions leaves the x-axis as a session index and preserves the flattened time gaps. Escalate day to week to month so the point count lands under a cap; roughly 24 points is readable at this card width, worth checking against a book with a few hundred sessions.

**Average words-weighted inside each bucket.** Plain averaging is the same defect as S6: a 10-word session would weigh as much as a 5,000-word one.

An earlier review suggested deleting the chart outright rather than fixing it. That was rejected; bucketing plus axes is the agreed scope.

Reasoning: `STATS-IMPROVEMENTS.md` B3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The chart plots one well-defined quantity rather than mixing dial values with measured rates
- [x] #2 A book with several hundred sessions renders a readable chart with a bounded number of points
- [ ] #3 Time gaps between sessions are visible in the x-axis rather than flattened to an index
- [x] #4 Bucket averages are words-weighted
- [x] #5 Values are recoverable by interaction rather than by printed labels on every point
- [x] #6 The chart has axis labels and remains legible at its current compact height
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done, with AC#3 deliberately not met.

`bucketSpeedSeries` in `services/stats/aggregate.ts` folds sittings into at most 14 points, words-weighted. `enablePointLabel` removed (that was what printed a number on all 90 overlapping points), y-axis and gridlines added, tooltip carries the bucket span, x-axis ticks are dated from each bucket's first sitting.

**AC#3 ("time gaps visible in the x-axis rather than flattened to an index") is not met, on purpose.** The task specified bucketing by time. Buckets hold a fixed number of *consecutive sittings* instead, so the x-axis is reading order. Time bucketing collapses a book read in two bursts months apart into two dense clumps at the edges with a void between, which is less readable than the problem it was meant to fix. Tick labels are still dated, so the chart is honest about when each bucket happened; the spacing just is not proportional to elapsed time.

Raised with the user twice and confirmed: "bucketing is fine for now". Revisit if a book with a long reading hiatus makes the even spacing misleading in practice.

AC#1 resolved by plotting one quantity: measured words per active minute across every mode. The dial no longer enters the series (see TASK-163 for the plausibility ceiling that keeps position jumps out of it).

Tests: 7 in `aggregate.test.ts` covering the cap, short series, words-weighting, ordering, and bucket spans. Mutations killed: dropping the weighting, dropping the sort, `ceil`->`floor` on the bucket size, `endedAt`->`startedAt`.
<!-- SECTION:NOTES:END -->
