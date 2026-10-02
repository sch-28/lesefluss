---
id: TASK-181
title: >-
  Forgiving reading streak: earned freezes, any-session threshold, 4am
  late-night window
status: Done
assignee: []
created_date: '2026-10-02 10:46'
updated_date: '2026-10-02 11:04'
labels:
  - stats
dependencies: []
modified_files:
  - packages/core/src/streak.ts
  - packages/core/src/__tests__/streak.test.ts
  - apps/capacitor/src/services/stats/aggregate.ts
  - apps/capacitor/src/services/stats/calendar.ts
  - apps/capacitor/src/services/stats/summaries.ts
  - apps/capacitor/src/services/stats/__tests__/aggregate.test.ts
  - apps/capacitor/src/services/stats/__tests__/calendar.test.ts
  - apps/capacitor/src/services/stats/__tests__/summaries.test.ts
  - apps/capacitor/src/services/db/queries/stats.ts
  - apps/capacitor/src/services/db/queries/index.ts
  - apps/capacitor/src/services/db/hooks/use-stats.ts
  - apps/capacitor/src/services/db/hooks/index.ts
  - apps/capacitor/src/services/db/hooks/query-keys.ts
  - apps/capacitor/src/pages/library/stats.tsx
  - apps/capacitor/src/pages/library/stats/hero.tsx
  - apps/capacitor/src/pages/library/stats/streak-calendar.tsx
  - apps/web/src/lib/social/profile-stats.ts
  - apps/web/src/lib/social/profile-stats.test.ts
priority: medium
ordinal: 126000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phone DB showed streak breaks on 2026-06-03, 07-18/19, 07-23 and 08-28. 08-28 had a real 2.6 min sitting that only counted 38s active, so the 1-minute day threshold dropped it. The other gaps were each covered by a sitting between 00:00 and 04:00 the next day.

Rules:
- A day counts if it has any saved session (the tracker already drops sittings under 5s / 5 words). No minute threshold.
- A day's reading window runs from 00:00 to 04:00 the next morning (28 hours). A sitting before 04:00 counts for both its own calendar day and the previous one. Yesterday is not missed until 04:00. Durations, intensity and best day stay on calendar days.
- Earned freezes: 1 per 7 read days, max 2 banked, spent automatically on a missed day. Frozen days count toward streak length and show as a snowflake in the calendar. Derived purely from the set of read days so app and server profile (packages/core streakFromDays) stay consistent without stored state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Any saved session makes its day count toward the streak and calendar
- [x] #2 A sitting before 04:00 local also counts for the previous day, in the app and in the server profile streak; yesterday is not missed before 04:00
- [x] #3 A missed day is bridged by a banked freeze; freezes are earned one per 7 read days, max 2
- [x] #4 Frozen days count toward current and longest streak and render distinctly in the streak calendar
- [x] #5 Banked freeze count is visible in the stats hero
- [x] #6 Core, app and web tests cover freezes, late-night window and threshold
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replay of the phone DB through summariseStreak: current 155, longest 155, no freezes spent, 2 banked. A hard 4am day shift was tried first and rejected: it split the 02:00 to 05:00 reading habit and dropped the streak to 4.

Review pass (3 reviewers + verifier) fixes: streakFromDays now walks read days as integer day numbers and ignores keys that are not four-digit-year YYYY-MM-DD (a session synced at 9999-12-31 with a +14 zone produced "10000-01-01" and hung the server profile view forever). A gap longer than the banked freezes spends nothing and leaves no frozen days. Missed days since the last read are covered but count toward current only once reading resumes, so best never shrinks. Calendar a11y summary skips the longest-day clause for time-less credited days and mentions freezes in an otherwise empty range.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Streak is now forgiving. Any saved session counts for its day. A sitting before 04:00 also counts for the previous day, and yesterday is not missed until 04:00. Every 7 read days earn a freeze (max 2 banked); a gap no longer than the bank is bridged and counts toward the streak, a longer gap breaks it. Frozen days show as a snowflake in the streak calendar and week strip, and the banked count shows in the stats hero. Logic lives in packages/core streakFromDays, shared by the app and the server profile (owner time zone). Hardened against malformed or far-past day keys. Replay of the phone DB: 155-day streak, no freezes spent.
<!-- SECTION:FINAL_SUMMARY:END -->
