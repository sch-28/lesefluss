---
id: TASK-159.2
title: 'Stats step 1: the visible fixes (S1, S4, S2 partial, S3, S6, P9, P4)'
status: To Do
assignee: []
created_date: '2026-07-28 19:38'
updated_date: '2026-07-28 19:40'
labels: []
milestone: m-7
dependencies:
  - TASK-159.1
documentation:
  - STATS-IMPROVEMENTS.md
parent_task_id: TASK-159
priority: high
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Everything originally complained about, in one pass. No migration, no shared-package API change, no vocabulary work. Depends on step 0 only because S3 and S6 rework a chart that C4 currently blanks.

**S1 — the period tabs have no selected state, anywhere in the app.** `packages/ui/src/components/tabs.tsx:57-60` styles the active trigger with Tailwind `data-active:` variants, but Radix emits `data-state="active"`. Proven empirically: the shipped bundle `apps/capacitor/dist/assets/index-Bolnwg01.css` contains 12 `[data-active]` selectors and zero `[data-state="active"]`. Tailwind is 4.2.2 and registers no such alias; the only `@custom-variant` declarations are `dark` and `sepia` in `packages/ui/src/styles/tokens.css:3-4`. The orientation classes are inert for the same reason (`data-horizontal` / `data-vertical` versus the emitted `data-orientation`).

Caution: fixing orientation also un-inerts `data-horizontal:flex-col` on the root at `tabs.tsx:16`. The two web call sites currently render as flex rows only because that class never matched, and will become columns. Those are layout changes to review, not free improvements. Exactly three call sites: `stats/period-totals.tsx:78-83`, `apps/web/src/routes/docs/index.tsx:52-63`, `apps/web/src/routes/login/index.tsx:342-349`.

**S4 — durations render as raw minutes.** `stats/top-books.tsx:37` computes minutes and renders `{minutes}m` at `:58`, producing "899m". `formatDuration` already exists at `apps/capacitor/src/utils/date-utils.ts:36-42`. Same class of bug for the "Minutes" stat at `stats/period-totals.tsx:95`, which shows a five-digit figure under the "all" period.

**S2, useful half only.** Period state is local to `PeriodTotals` (`period-totals.tsx:46`), so no other section can see it. Lift it into `stats.tsx` and thread it to `TopBooks`, which currently hardcodes 30 days at `top-books.tsx:14` and is why all-time top books are unreachable. `getTopBooks({ since: 0 })` already supports it with no query change. The rest of S2 is step 4.

**S3 — the headline reports the user's own dial setting.** `reading_sessions.wpm_avg` stores the RSVP dial for rsvp rows and a measured rate for other rows, and `stats/wpm-trend.tsx:90-91` puts `rsvpTarget` first in the headline priority list. Do NOT replace it with a derived rate: `backlog/completed/task-46.3:95` records that `words / activeMinutes` was already tried and reverted, and the three-series chart is the resolution. Fix by reordering the priority list and relabelling, and prefer showing "target 400 · delivering 250" as one line since the gap is the point. `rsvpDelivered` already exists at `stats.ts:262`.

**S6 — weighted buckets, unweighted headline.** `stats.ts:249-254` weights each session by words read; `wpm-trend.tsx:24-28` then takes a plain mean of the weekly averages for the headline and every legend entry, so a week with one 10-word session weighs as much as a week with 300k.

**P9 — peak hour lies on empty data.** `stats/personality.tsx:21` reduces with strict `>` and keeps index 0, telling a user with no data their favourite reading hour is midnight.

**P4 — empty periods collapse the page.** `top-books.tsx:19` and `book-stats-card.tsx:22` both return `null` when empty. Once the period drives Top Books, selecting a quiet period makes sections vanish and the layout jump.

Reasoning and rejected alternatives: `STATS-IMPROVEMENTS.md` sections 1 and 2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The selected time-range tab is visually distinguishable in light, dark and sepia
- [ ] #2 The web docs and login tab layouts are reviewed after the orientation fix and render as intended
- [ ] #3 Durations over an hour render as hours and minutes everywhere, including the all-time period
- [ ] #4 Selecting a period updates Top Books, and an all-time view of Top Books is reachable
- [ ] #5 The reading-speed headline reports a measurement or is labelled unambiguously as a target, never an unlabelled dial value
- [ ] #6 Headline and legend averages are words-weighted, matching the query
- [ ] #7 A user with no sessions sees no fabricated favourite hour
- [ ] #8 Switching to a period with no data leaves every section present with an empty state rather than removing it
- [ ] #9 The page states that reading done on the ESP32 device is not counted (P11)
<!-- AC:END -->
