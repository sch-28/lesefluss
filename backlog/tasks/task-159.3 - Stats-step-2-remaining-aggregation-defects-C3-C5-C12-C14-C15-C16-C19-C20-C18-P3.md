---
id: TASK-159.3
title: >-
  Stats step 2: remaining aggregation defects (C3, C5, C12, C14, C15, C16, C19,
  C20, C18, P3)
status: Done
assignee: []
created_date: '2026-07-28 19:38'
updated_date: '2026-07-29 00:38'
labels: []
milestone: m-7
dependencies:
  - TASK-159.1
documentation:
  - STATS-IMPROVEMENTS.md
modified_files:
  - apps/capacitor/src/pages/reader/session-tracker.ts
  - apps/capacitor/src/pages/reader/__tests__/session-tracker.test.ts
  - apps/capacitor/src/services/stats/aggregate.ts
  - apps/capacitor/src/services/stats/__tests__/aggregate.test.ts
  - apps/capacitor/src/services/db/queries/stats.ts
  - apps/capacitor/src/services/db/queries/reading-sessions.ts
  - apps/capacitor/src/services/db/queries/index.ts
  - apps/capacitor/src/services/db/hooks/query-keys.ts
  - apps/capacitor/src/services/db/hooks/use-reading-sessions.ts
  - apps/capacitor/src/services/db/hooks/use-stats.ts
  - apps/capacitor/src/services/db/hooks/index.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/pages/library/session-table.tsx
  - apps/capacitor/src/pages/library/book-stats-card.tsx
  - apps/capacitor/src/pages/library/stats.tsx
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
- [x] #1 Longest streak is correct when the device timezone is west of UTC
- [x] #2 The 90-day heatmap contains exactly 90 distinct local dates across a DST transition
- [x] #3 Books finished excludes series chapter rows
- [x] #4 A session row's percentage and word count agree, or the row explains why they differ
- [x] #5 Top Books returns the requested number of non-deleted books, and its total agrees with the period totals
- [x] #6 A session spanning midnight distributes its time across the hours it actually covers
- [x] #7 Sub-minute totals render honestly rather than rounding up to 1m
- [x] #8 Revisiting the stats page reuses cached queries instead of missing on a fresh key each time
- [x] #9 The session list fetches only the rows it renders
- [ ] #10 getStreak, getHourHistogram and getPersonalityStats no longer scan the full table unbounded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
C3 and C5 were fixed early, in TASK-159.1. Extracting the pure date maths into `queries/stats-aggregate.ts` to make C4 and C6 testable resolved both as a side effect: longest-streak no longer reparses 'YYYY-MM-DD' (which JS reads as UTC midnight), and the 90-day window steps in local days. Both are covered by `queries/__tests__/stats-aggregate.test.ts` under a negative-UTC-offset timezone and across both DST transitions.

This task only needs to verify them, not fix them. The remaining items are unchanged: C12, C14, C15, C16, C19, C20, C18, P3.

Reopened: the review ran, then six fixes were applied on top of it and the task was marked Done without re-reviewing them. Verification pass on that delta before closing.

Verification pass over the six post-review fixes found five more things, one of them a root cause.

**The hour-smear clamp was treating a symptom.** `buildRow` always wrote `endedAt: now`. Backgrounding overnight produced a *correct* checkpoint row on the way out, then `reconcile` re-upserted the same id with `endedAt` set to the moment the user returned, clobbering a good row with a bad one. `durationMs` had been right all along. Fixed at the source: a paused sitting now ends at its last activity. Verified by mutation that the new test goes red against `endedAt: now`.

The ratio clamp stays, but its justification changed: it is now only for rows already recorded and synced under the old behaviour, and the comment says so.

**"Show more" could become permanently unreachable.** `hasMore` required `total != null`, and retries are disabled globally, so one failed COUNT(*) over the bridge would leave the table silently truncated at 20 rows with no button and no error. Falls back to a full-page heuristic now.

Also: dropped a dead `(total ?? 0)`, removed two doc comments left pointing at deleted hooks (one had drifted onto `useReadingSessionsPage` and described it as book-scoped and unlimited, which it is not), and pinned the clamp ratio in its test — the case as written passed for any ratio up to about 8.

**Rejected one finding.** The reviewer flagged that dropping `Math.max(1, ...)` makes a 40-second session render "0m" instead of "1m". That is C19 and acceptance criterion #7: sub-minute totals should read honestly rather than rounding up.

**Noted, not fixed:** `sync/index.ts` sets `changed = true` for every server session on every pull, so the `if (changed)` guard is effectively always true when stats sync is on and the whole stats page recomputes on each resume. Pre-existing, bounded, local reads only. Belongs with the sync work in TASK-159.4.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
C12, C14, C15, C16, C18, C19, C20 closed. C3 and C5 were already done in TASK-159.1. P3 is only partly addressed, see below.

**C16 — hour histogram.** Moved into the tested module as `bucketMinutesByHour`, spreading a sitting across the wall-clock hours it covers instead of dumping it all on its start hour. Review verified the arithmetic across Kathmandu, Lord Howe and Chatham (non-hour offsets), both DST directions, zero and negative spans, and confirmed the loop always terminates.

It also found a case the first version got wrong: a sitting left in the background records `endedAt` as the moment the user came back, so 20 active minutes at 22:00 were smeared over ten hours, crediting 02:00-07:00 with reading the tracker's own idle rule says never happened. Now clamped. The first clamp attempt (`duration + 10 min`, from the hard-end rule) was itself wrong: soft pauses do not end a session, so a 60-minute sitting with 60 minutes of short pauses is legitimate and would have been mis-narrowed. Clamped by ratio instead.

**C12** — `isNull(books.seriesId)` in the finished-books count. Note the consequence: a finished serial now contributes zero rather than one.

**C15** — `getTopBooks` inner-joins `books` and filters deleted rows before the LIMIT, so deleting your top book no longer returns four cards. Collapsed the follow-up lookup into the join; review confirmed the join is strictly 1:1 on the primary key, so no fan-out.

**C18** — the session table fetches only what it renders. Growing the page changes the query key, which flipped `isPending` and replaced the table with a spinner on every "show more", so it carries `placeholderData`.

**C20** — the period-totals key quantised to the local day. This exposed a latent bug rather than only fixing one: the sync pull writes session rows but never invalidated `statsKeys`, and the old per-visit `Date.now()` key had been hiding that behind an accidental refetch. Stats after a cross-device sync would have stayed stale until local midnight. Added the missing invalidation.

**C14** — the row percentage now derives from `wordsRead`, like the number beside it, rather than from the start-to-end span, which includes skipped and re-read text. That mismatch produced "0% · 900 words".

**C19** — `Math.max(1, ...)` removed; `formatDuration` already floors.

**Also from review:** `countReadingSessions` duplicated the existing `getSessionCount` under a key with different invalidation, so one screen issued two identical `COUNT(*)` round-trips that could disagree. Deleted the older one. Removed dead code the swap left behind: `useAllReadingSessions`, `useReadingSessionsByBook`, `getReadingSessionsByBook`, `readingSessionKeys.byBook`, `statsKeys.sessionCount`. Fixed a header/button flicker while the count is in flight.

**P3 not fully closed, deliberately.** C18 fixed the UI path, which was the worst offender. `getStreak` genuinely needs every row for an all-time longest streak, `getPersonalityStats` already aggregates in SQL and returns a single row, and windowing the hour histogram is a product decision that belongs with the period wiring in TASK-159.5.

335 tests, tsc clean, biome clean, build clean.
<!-- SECTION:FINAL_SUMMARY:END -->
