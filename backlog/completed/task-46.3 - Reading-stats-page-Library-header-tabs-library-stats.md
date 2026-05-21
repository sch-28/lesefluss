---
id: TASK-46.3
title: Reading stats page (Library header + /tabs/library/stats)
status: Done
assignee: []
created_date: '2026-04-30 23:30'
updated_date: '2026-05-01 01:14'
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
- [x] #1 Library header has a stats icon in `slot="end"` that routes to `/tabs/library/stats`
- [x] #2 Route is registered and the tab bar hides on the stats page like other sub-pages
- [x] #3 Period totals (Today / 7d / 30d / All time) render correct numbers from session rows
- [x] #4 Current and longest streaks compute correctly across day boundaries (timezone = device local)
- [x] #5 Top books this month lists up to 5 books, sorted by duration, tappable to book detail
- [x] #6 WPM trend renders only when there is at least one RSVP session; otherwise shows the empty-state copy
- [x] #7 Whole-page empty state is shown when zero sessions exist
- [x] #8 All queries live in `apps/capacitor/src/services/db/queries/stats.ts`
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Stack

Pulled in `@nivo/{core,line,calendar,bar}` and `framer-motion` (the original spec said "no new deps", overridden after agreeing the page should feel polished). Lazy-loaded the route via `React.lazy` + `Suspense` so the chart libs only ship when the user opens stats.

## Files

- `apps/capacitor/src/services/db/queries/stats.ts` — all aggregations (`getPeriodTotals`, `getStreak`, `getTopBooks`, `getWeeklyWpm`, `getHourHistogram`, `getPersonalityStats`, `getSessionCount`, `hasWpmSessions`).
- `apps/capacitor/src/utils/date-utils.ts` — local-day helpers + `previousLocalDayStart` (DST-safe day stepping).
- `apps/capacitor/src/services/db/hooks/use-stats.ts` + new `statsKeys` factory.
- `apps/capacitor/src/pages/library/stats.tsx` + `stats/` (hero, period-totals, activity-heatmap, top-books, wpm-trend, personality, empty-state, animated-number, nivo-theme, cover-accent).
- `apps/capacitor/src/App.tsx` — lazy route + `isSubPage` predicate.
- `apps/capacitor/src/pages/library/index.tsx` — header `statsChartOutline` icon.

## Notable design moves

- Hero backdrop uses the top book's actual cover, blurred + ken-burns, with the brand-orange gradient as `mix-blend-overlay`. Falls back to a rotating conic gradient if no cover.
- Activity = full Nivo calendar heatmap of the last 90 days (replaced the planned 14-dot strip).
- WPM trend renders up to **3 series**: RSVP target (configured dial), RSVP delivered (computed from `words/activeMinutes` for RSVP rows), and Reading speed (same formula for scroll/page rows). Plus a dashed horizontal reference line at 250 WPM ("avg adult reader"). Custom tooltip shows series name + WPM + "Nw ago".
- Charts use the brand orange `#c94b2a` (matches toast) plus a warmer/softer secondary palette per theme.
- Axis legends added on every chart (line + bar). Heatmap has its own "Less → More" scale strip.

## Bugs found and fixed during build

1. **Session never recorded after RSVP toggle.** `useReadingSession` had two effects: `[bookId, mode]` (flush on unmount) and `[isActive]` (open session). Toggling RSVP mid-read changed `mode` but not `isActive`, so the prior session flushed but no new one opened. Fixed by opening a new session in the `[bookId, mode]` body when `isActiveRef.current` is true.
2. **WPM was lower than the dial setting.** Original formula `words / activeMinutes` measured *delivered* rate, which is ~63% of nominal due to punctuation pauses + accel ramp. Now stores configured dial for RSVP, delivered rate for scroll/page, and the chart exposes both alongside each other.
3. **Streak DST off-by-one.** Raw `cursor -= MS_PER_DAY` and `dayStart - prev === MS_PER_DAY` broke on 23h/25h DST days. Replaced with `previousLocalDayStart()` (subtract 12h, snap to local-day start).
4. **`Date.now()` in queryKey caused infinite refetch.** Locked "now" per-mount via `useMemo([])` and threaded through to `PeriodTotals` / `TopBooks`.
5. Misc: removed unsafe `as Period` cast, lowered Suspense fallback to a real spinner, dropped a button's default browser bg that was halo-ing top-book cards, made Nivo type loose for `theme` (only @nivo/theming was a transitive dep we don't own).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built `/tabs/library/stats`, a multi-section reading-stats dashboard reachable from the new chart icon in the library header.

**Sections shipped:** hero card (animated count-up over a blurred cover backdrop), period totals (Today/7d/30d/All segment with cross-fade and delta pills), 90-day activity heatmap, top-books carousel, three-series WPM/reading-speed trend with a 250 WPM reference line, and a "reading personality" section (favorite hour, longest session, fastest WPM + an hour-of-day histogram). Whole-page friendly empty state when no sessions exist.

**Beyond the original spec (with explicit user agreement):**
- Pulled in `@nivo/{core,line,calendar,bar}` and `framer-motion`. Route is lazy-loaded.
- Heatmap replaces the 14-dot strip from the spec — same data, much stronger anchor.
- WPM trend split into three series (RSVP target, RSVP delivered, reading speed) so users can see the gap between dial setting and what the engine actually emits. Reference line at 250 WPM.
- Reading personality section added (favorite hour + 3 single-stat callouts).
- Brand orange `#c94b2a` used across all charts to match the toast surface.

**Side fixes that came out of testing:**
- Reading sessions weren't being recorded after toggling RSVP mid-read (`useReadingSession` opened a session only on `isActive` flips, not on mode change).
- DST bug in the streak walk (raw `MS_PER_DAY` arithmetic).
- `Date.now()` in queryKeys caused infinite refetch.

Verified: typecheck clean, 164 unit tests pass, biome clean on touched files. Manual: read in RSVP for 30s → row appears with correct configured WPM; toggle dark/sepia/light → all charts re-skin via the runtime nivo-theme that reads CSS vars.
<!-- SECTION:FINAL_SUMMARY:END -->
