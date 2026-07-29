---
id: TASK-163
title: Stop implausible sessions from destroying reading-speed averages
status: To Do
assignee: []
created_date: '2026-07-29 02:35'
labels:
  - stats
  - correctness
  - reader
dependencies: []
references:
  - apps/capacitor/src/services/stats/aggregate.ts
  - apps/capacitor/src/pages/reader/session-tracker.ts
  - apps/capacitor/src/services/db/queries/stats.ts
priority: high
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A handful of sessions record thousands of words against seconds of active time, and because every speed figure is words-weighted those rows dominate every average they touch.

## Evidence (real device DB, 292 sessions, 2026-07-29)

18 sessions over 800 wpm, 11 over 2000. Worst offenders:

```
2026-06-26T00:24 scroll wpm=49224 words=22488 dur=27s  span=36848->59307
2026-06-28T03:20 scroll wpm=25112 words=17707 dur=42s  span=63820->81528
2026-07-13T15:50 scroll wpm=25004 words=29424 dur=71s  span=88628->118052
2026-07-28T02:22 scroll wpm=23439 words= 5523 dur=14s  span=247174->253575
2026-07-14T12:01 scroll wpm= 7437 words=51618 dur=416s span=126797->175861
```

Impact on the "Reading speed" headline:

- all-time words/active-minute: **306 wpm**
- same figure excluding rows over 800 wpm: **244 wpm**
- worst weekly bucket in the all-time chart: **14030 wpm**, which forces the y-axis to 15000 and flattens every real point into the bottom 2% of the plot

The chart is unreadable and the headline is wrong by ~25%.

## Cause

All offenders are `scroll` mode. The `readSpans` jump guard from the session-tracker fix is working (the 2026-07-28 row credits 5523 words against a 6401-word span, so some movement was rejected), but `JUMP_WORDS_PER_TICK` for scroll is loose enough that repeated sub-threshold jumps still accumulate. Fast scrolling, fling-scrolling and chapter navigation all look like legitimate reading one tick at a time.

Note this is two problems, and both need addressing:

1. **Recording** — the tracker still writes these rows today (newest offender is 2026-07-28).
2. **Existing data** — ~292 rows are already on device and already synced, so a recording-side fix alone leaves every historical average wrong. Stats aggregation has to defend itself regardless.

## Approach

Prefer sanitising at aggregation rather than deleting rows: session rows are synced and have no tombstones, so deletion cannot propagate (see TASK-162). A plausibility ceiling in `aggregate.ts` fixes history and new data at once, and keeps the raw rows intact.

Open question for whoever picks this up: clamp the outlier to a ceiling, or drop it from the speed calculation entirely? Dropping is more honest for a *speed* figure (the words were not read at that rate), but the words still legitimately count toward "words read" totals, so the two statistics need to diverge. Do not silently apply the ceiling to word totals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A plausibility ceiling is applied in `aggregate.ts` so no single session can dominate `buildWpmTrend`, `summariseReadingRates` or `getBookStats`
- [ ] #2 Words-read and time-read totals are NOT reduced by the ceiling — only speed figures are affected
- [ ] #3 The all-time reading-speed chart y-axis is driven by plausible data (no 14030 wpm bucket)
- [ ] #4 Tracker-side: scroll-mode fling/fast-scroll and chapter navigation no longer accumulate into `wordsRead` as reading
- [ ] #5 Tests cover an outlier row and assert it moves the speed average by a bounded amount; mutation-check that removing the ceiling fails them
- [ ] #6 Verified against the real device DB: all-time measured wpm lands near 244, not 306
<!-- AC:END -->
