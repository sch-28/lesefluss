---
id: TASK-163
title: Stop implausible sessions from destroying reading-speed averages
status: Done
assignee: []
created_date: '2026-07-29 02:35'
updated_date: '2026-07-29 22:36'
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
- [x] #1 A plausibility ceiling is applied in `aggregate.ts` so no single session can dominate `buildWpmTrend`, `summariseReadingRates` or `getBookStats`
- [x] #2 Words-read and time-read totals are NOT reduced by the ceiling — only speed figures are affected
- [x] #3 The all-time reading-speed chart y-axis is driven by plausible data (no 14030 wpm bucket)
- [x] #4 Tracker-side: scroll-mode fling/fast-scroll and chapter navigation no longer accumulate into `wordsRead` as reading
- [x] #5 Tests cover an outlier row and assert it moves the speed average by a bounded amount; mutation-check that removing the ceiling fails them
- [x] #6 Verified against the real device DB: all-time measured wpm lands near 244, not 306
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Aggregation half done, verified on the real device DB.

`MAX_PLAUSIBLE_WPM = 1500` + `isPlausibleRate(words, durationMs)` in `aggregate.ts`, applied in `buildWpmTrend`, `summariseReadingRates` and `getBookStats`. Chose **exclude** over clamp: the words were not read at that rate, so a clamped value would still be a fabricated measurement. Totals are untouched — the guard sits only on the derived rate, so a position jump still counts as time spent and words covered.

Effect on the device DB (294 sittings, 12 rejected = 4%):
- all-time measured: 3839 → 258 wpm
- all-time buckets: `[247,229,210,286,1173,238,242,217,14030,253,3250,4562,295,3054]` → `[247,229,210,279,235,238,242,217,256,253,250,258,295,310]`
- book sparkline (Well of Ascension, 86 sittings): flat line + one 10000 spike → `[251,248,262,264,278,270,309,289,251,254,293,306,309]`

Remaining: AC#4 only — the tracker still writes these rows (`session-tracker.ts`), so the raw data keeps degrading even though no surface shows it now. Scroll-mode fling and chapter navigation accumulate into `wordsRead` one sub-threshold tick at a time; `JUMP_WORDS_PER_TICK` for scroll is too loose.

Tracker half done (AC#4).

**Investigation.** The `readSpans` jump guard landed the same day as this task (d17bde6), and all 12 implausible rows predate it, so the first question was whether the tracker still writes them. Driving the real tracker with a virtual clock says yes:

| scenario | credited | rate |
|---|---|---|
| normal reading | 1500 of 1500 | 300 wpm |
| fling @399/tick | 5586 of 5586 | 4788 wpm |
| single big jump | 0 | rejected |
| fling preface then read 5min | 6288 of 6288 | 1048 wpm |
| page-mode flipping | 16786 of 16786 | 14388 wpm |

`JUMP_WORDS_PER_TICK` is a distance over a fixed sample, so `scroll: 400` per 5s permits 4,800 wpm indefinitely. It only catches a single large leap (a TOC tap), which is the case that was already fine. Note row 4: a realistic preface-skip lands at 1048 wpm, *below* `MAX_PLAUSIBLE_WPM`, so the read-side ceiling never catches it. The aggregation fix alone was not sufficient.

**Threshold from real data** (sittings over 30s, this device):
```
scroll  n=223  median=242  p90=342  p95=533  p99=10982  max=25112
rsvp    n=  8  median= 98  p90=224  p95=224  p99=  224  max=  224
```
Honest reading tops out near 533 at p95 then jumps to five figures, so 800 (the existing `SANE_WPM_CEILING`) separates the two cleanly.

**Fix.** A token bucket on credited words in `session-tracker.ts`: refills at the credit ceiling times elapsed time, capacity `CREDIT_BURST_WORDS = 500`, drained by forward movement, `min(distance, budget)` credited. Starts empty so a fling in the first seconds earns nothing. Refill is clamped by `POLL_THROTTLE_GUARD_MS` so a suspended timer cannot buy credit for a chapter-sized skip. RSVP uses the dial times `RSVP_DIAL_HEADROOM` rather than the flat ceiling, otherwise a 1000 wpm dial would be throttled to 800.

A burst allowance rather than a flat per-tick rate because page mode advances a whole page at a turn after a minute of stillness; a flat gate would reject legitimate page turns.

After: fling 5586 -> 933 credited, page flip 16786 -> 933, fling-then-read 1048 wpm -> 383 wpm. Normal reading unchanged at 1500 / 300 wpm. Position still advances on a skip, so progress percent and page counts stay correct; only `wordsRead` and the derived rate stop counting ground crossed without reading.

**Tests.** Four existing fixtures moved 300 words per 5s tick (3,600 wpm) and now trip the ceiling; rewritten at 50 words per tick so they still pin span-merge semantics rather than rate. The property test's union oracle cannot describe a throttle without duplicating it, so it was split: exact equality under a readable-pace generator, plus a bound (`credited <= union` and `<= ceiling x elapsed + burst`) under the adversarial generator, plus an explicit fling case. Three mutations killed: removing the cap, starting the budget full, unclamping the refill.

Closed. Both halves shipped and reviewed.

Since the last note, review found and fixed: the RSVP branch of `creditCeilingWpm` was entirely untested (two mutations survived), `CREDIT_BURST_WORDS` was untested as a cap, the refill's placement relative to the `shouldBeActive` gate was untested (hoisting it above survived the whole suite, which is exactly the regression that placement prevents), and `Math.floor` vs `Math.ceil` on the credit was untested. Four tests added, all five mutations now fail.

The property test's PRNG was also broken: `state * 1103515245` exceeds 2^53, so the float dropped the low bits the mask kept. Both properties were running 895 distinct sequences rather than the 200,000 they claimed. Fixed with `Math.imul`, and the throttle bound was tightened by removing a burst allowance that left it slack by 500 words.

The historical rows stay bad and are already synced, so the aggregation ceiling remains load-bearing rather than a belt-and-braces measure. It now has direct coverage: `services/db/__tests__/stats-queries.test.ts` asserts against real SQLite that a position jump counts toward time and words but not toward speed.

Not verified in the field yet: the tracker change is evidenced by simulation against the real tracker with a virtual clock, not by observing new rows. Worth a glance at the sessions list after a few sittings to confirm no new implausible rows appear.
<!-- SECTION:NOTES:END -->
