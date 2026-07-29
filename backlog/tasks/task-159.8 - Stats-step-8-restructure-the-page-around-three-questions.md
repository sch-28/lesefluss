---
id: TASK-159.8
title: 'Stats step 8: restructure the page around three questions'
status: Done
assignee: []
created_date: '2026-07-29 01:26'
updated_date: '2026-07-29 01:38'
labels: []
milestone: m-7
dependencies:
  - TASK-159.5
documentation:
  - STATS-IMPROVEMENTS.md
modified_files:
  - apps/capacitor/src/pages/library/stats.tsx
  - apps/capacitor/src/pages/library/stats/activity.tsx
  - apps/capacitor/src/pages/library/stats/hero.tsx
  - apps/capacitor/src/pages/library/stats/wpm-trend.tsx
  - apps/capacitor/src/pages/library/session-table.tsx
  - apps/capacitor/src/services/db/queries/stats.ts
  - apps/capacitor/src/services/db/queries/index.ts
  - apps/capacitor/src/services/db/hooks/use-stats.ts
  - apps/capacitor/src/services/db/hooks/query-keys.ts
  - apps/capacitor/src/services/db/hooks/index.ts
parent_task_id: TASK-159
priority: medium
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The stats page is seven sections, four charts and roughly twenty numbers, with nothing saying what the reader should conclude from any of it. Both of the complaints that started this work were "I asked the page a question and it would not answer", not "this number is wrong" — information architecture, not correctness.

Reorganise so every section has a job, and cut what does not serve one.

    Activity           streak + 90-day heatmap        (am I reading)
    [Today|7d|30d|All]
    Reading            time · words · finished        (how much)
    Top books          carousel
    Reading speed      one number, one trend          (how fast)
    Recent sessions    last 20, see all →

**The three questions are an organising principle, not copy.** No section is headed "Am I reading?". Headings stay concrete.

Concrete changes:

- The period tabs move inside the "how much" group rather than floating above the whole page. This dissolves D4: nothing appears to ignore a control that is no longer above it.
- The hour histogram folds into Activity, and reverts to all-time. "Your favourite reading hour, today" was never a statistic.
- "Fastest WPM" is deleted. It reports a single outlier row, and under any derived metric it surfaces the worst artifact in the user's history as an achievement.
- The speed section shows one number and one trend, with the target as a dashed reference, instead of three series and a legend.
- Recent sessions becomes an explicit "last 20, see all →".

**This partly reverses TASK-159.5**, which windowed `getHourHistogram` and `getPersonalityStats` to the period and scoped the tabs page-wide. Under this structure those two are all-time by design, so that windowing becomes dead weight. The cost was known when the decision was taken; do not treat the revert as a mistake to work around.

Reasoning and the original argument: `STATS-IMPROVEMENTS.md` section 6.

Sequencing note: this changes which sections exist, so it should land before DRAFT-1's items are built against the old shape. It does not block TASK-159.6, whose items already live on book detail.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each section on the stats page has one stated job, and nothing renders that does not serve one
- [x] #2 The period control sits within the group it drives, not above sections that ignore it
- [x] #3 Fastest WPM is gone
- [x] #4 The speed section leads with one number rather than three series and a legend
- [x] #5 The hour histogram is all-time and no longer takes a window
- [x] #6 Recent sessions shows a bounded list with an explicit way to see more
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Net −151 lines. For a task whose premise was that the page had been assembled by accumulation, removing more than it adds is the right shape.

**The page now reads:** hero (streak) → Activity (90-day heatmap + all-time hour histogram) → period tabs → Reading totals → Top books → Reading speed → Recent sessions.

**Hero answers the habit question.** It led with a period word count that the totals section repeated two rows below; it now leads with the streak, longest as a chip. One duplicated number gone.

**Personality deleted entirely** — component, query, hook, query key, and the unused `mostReadBookId` / `totalSessions` that came with it. Its histogram moved into Activity and reverted to all-time.

**Speed chart plots one line.** Three series plus a legend made the reader work out which number was theirs. Now one measured series, with the RSVP target and the average-reader baseline as labelled dashed references.

**Tabs sit inside the group they drive**, which is what dissolves D4.

**Review caught a regression I introduced.** Deleting the legend row removed the only always-visible rendering of the average-reader value — and nivo markers are a render layer that never enters the y-scale, so whenever 225 exceeded the plotted maximum the reference line and its new label were silently clipped out of view. That is routine now that only one series is drawn. The scale maximum is folded by hand to cover both markers.

It also found the streak rendered twice: the Activity header still carried its own current-and-longest readout directly beneath the hero that now headlines exactly those two numbers. Removed, which is AC #1's whole point.

Also from review: the section subtitle claimed "Always last 90 days" for a section that now also holds an all-time chart, two stacked doc blocks on one declaration, a dead multi-series guard on `enableArea`, group comments that narrated the structure (one of them false — the speed section reads the period but sits outside the group the comment claimed it was in), and a file still named `activity-heatmap.tsx` after it grew a second chart.

**Deliberate information loss**, stated rather than buried. Three statistics are gone:

- **Fastest WPM** — explicit intent, AC #3. A single outlier row, and under any derived metric it surfaces the worst artifact in the user's history as an achievement.
- **Favourite hour** — readable off the histogram it sat above, and it was the callout that reported "midnight" on empty data.
- **Longest session** — not named in the original task text; review flagged it as an accidental casualty. Keeping it deliberately: it is the same single-outlier-row objection as Fastest WPM, and re-homing one curiosity would reintroduce the accumulation this task exists to undo. Recorded here so the deletion is a decision rather than a side effect.

355 tests, tsc clean, biome clean, build clean.
<!-- SECTION:FINAL_SUMMARY:END -->
