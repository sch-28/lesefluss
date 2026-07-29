---
id: TASK-159.6
title: 'Stats step 5: context numbers on both surfaces (S5, B1, B2, S8, P1, P7, C13)'
status: Done
assignee: []
created_date: '2026-07-28 19:39'
updated_date: '2026-07-29 02:01'
labels: []
milestone: m-7
dependencies:
  - TASK-159.2
documentation:
  - STATS-IMPROVEMENTS.md
modified_files:
  - apps/capacitor/drizzle/0029_book_finished_at.sql
  - apps/capacitor/drizzle/meta/_journal.json
  - apps/web/drizzle/0015_book_finished_at.sql
  - apps/web/drizzle/meta/_journal.json
  - apps/web/src/db/schema.ts
  - apps/web/src/routes/api/sync.ts
  - packages/core/src/sync.ts
  - apps/capacitor/src/services/db/schema.ts
  - apps/capacitor/src/services/db/index.ts
  - apps/capacitor/src/services/db/queries/books.ts
  - apps/capacitor/src/services/db/queries/stats.ts
  - apps/capacitor/src/services/db/queries/series.ts
  - apps/capacitor/src/services/db/queries/index.ts
  - apps/capacitor/src/services/db/hooks/use-stats.ts
  - apps/capacitor/src/services/db/hooks/query-keys.ts
  - apps/capacitor/src/services/db/hooks/index.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/services/stats/aggregate.ts
  - apps/capacitor/src/services/stats/__tests__/aggregate.test.ts
  - apps/capacitor/src/pages/library/book-detail.tsx
  - apps/capacitor/src/pages/library/book-stats-card.tsx
  - apps/capacitor/src/pages/library/sort-filter.ts
  - apps/capacitor/src/pages/library/stats.tsx
  - apps/capacitor/src/pages/library/stats/top-books.tsx
  - apps/capacitor/src/pages/library/stats/wpm-trend.tsx
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/utils/reading-progress.ts
  - apps/capacitor/src/utils/reading-time.ts
parent_task_id: TASK-159
priority: medium
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gives both surfaces the context they currently lack. Blocked on the section 6 decision in `STATS-IMPROVEMENTS.md`, which may remove some of this.

**S5 — top book cards carry no reading context.** Rank, cover, title, author, time. Nothing says whether that time was fast or slow, how much of the book it covered, or how long the book is. `getTopBooks` selects only `bookId` and `SUM(durationMs)` (`stats.ts:156-159`); add `SUM(wordsRead)`, `COUNT(*)`, and `books.wordCount` to the existing second SELECT at `:169-176`. Per decision D2 the carousel stays: cover badge gets the duration, one line under the author gets speed and share of book, everything else moves to book detail.

**B1 — book length, expressed as pages.** `books.wordCount` and `books.size` are populated but unshown. Time is the wrong unit for length because it measures the reader, not the book. Use `~N pages` from `ceil(wordCount / 250)`; 250 is already this project's number (AGENTS.md, ESP32 page simulation). This does not conflict with page mode: `reader/page-view/` page indices are chunk-local and the reader never shows the user a page number, only percent and time left (`reader/index.tsx:1630-1641`). Suppress pages for series chapter rows. If it should later be configurable, make the setting local-only like `onboardingCompleted` so it skips the sync schema and the web migration.

**B2 and S8 — time estimates use the wrong speed.** `book-stats-card.tsx:90-95` prints "Average RSVP target". `reader/index.tsx:1377` computes `readerMode === "rsvp" ? rsvpSettings.wpm : 250`, so the reading screen's "time left" estimates from the dial in RSVP (roughly 37% short, per task-46.3:95) and from a hardcoded constant otherwise. Per decision D6: scroll and page estimate from the user's measured speed for that mode; RSVP estimates from `dial × deliveredRatio`, where the ratio is their historical RSVP delivered over target, both already produced by `getWeeklyWpm` (`stats.ts:283-285`). Fall back to ~0.65 until there is history.

**P1 — books finished counts the wrong thing.** `stats.ts:36-49` counts books whose `lastRead` falls in the window and are past 95%, so reopening a book finished in March counts it as finished today, and March loses it permanently. Deriving purely from the crossing session is NOT sufficient: sessions only exist since `drizzle/0022_reading_sessions.sql`, so pre-existing books would drop out entirely. Add `finished_at`, backfill once from the `lastRead` heuristic for books already past the threshold, then maintain from the crossing session. The 95% constant is duplicated at `stats.ts:7`, `series.ts:215` and `pages/library/sort-filter.ts:90`.

**P7 — per-mode speeds are averaged together.** Trim to labelling which mode dominated the figure rather than adding a three-way split.

**C13 — serials never roll up.** `getTopBooks` groups by `bookId` and every chapter is its own row, so Top Books fills with individual chapters and a 400-chapter web novel can never rank against a single EPUB. `series-detail.tsx` mounts neither the stats card nor the session table, so serial readers have no per-work stats surface.

Reasoning: `STATS-IMPROVEMENTS.md` sections 1 and 2, decisions D2 and D6.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A top book card conveys reading speed and share of the book covered without a layout redesign
- [x] #2 Book detail states the book's length in pages and words, suppressed for series chapters
- [x] #3 Time-remaining estimates use measured speed in scroll and page modes
- [x] #4 RSVP time-remaining responds immediately to a dial change and does not systematically underestimate
- [x] #5 A book finished months ago and reopened today is not recounted as finished today
- [x] #6 Books finished before session tracking existed still appear in all-time totals
- [x] #7 Speed figures state which mode produced them
- [ ] #8 A multi-chapter serial aggregates as one work in Top Books, and has a stats surface on the series page
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Not blocked after all. Section 6 is resolved as a restructure (TASK-159.8), but what it moves — book length, time remaining, per-mode splits, chapter tables — already lives on book detail, which is where this task's items are. What section 6 threatens is DRAFT-1.

Two decisions taken for this task:

**D8, `finished_at` syncs.** The first instinct was local-only, on the reasoning that each device derives it from inputs that already sync. That is wrong: it holds only while stats sync is on, and that is user-toggleable. A device with it off never sees the crossing session and would derive a different answer or none, so two devices would disagree on a headline figure in period totals. Cost is migrations on both apps plus an optional nullable `SyncBookSchema` field. Writing the column must bump `books.updatedAt` or last-write-wins discards it.

**D9, the serial roll-up stops at Top Books.** Aggregate a series' chapters into one entry linking to the series page, so a 400-chapter web novel stops crowding out books. Giving series detail its own stats card and session table is explicitly out: `series-detail.tsx` has no stats surface at all today, so that is a new surface rather than a fix, and it earns its own task if the roll-up shows it is wanted.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
First change in this family to touch the server. Both apps typecheck and build; 362 tests.

**P1 — `finished_at`, synced per D8.** Two migrations (SQLite integer, Postgres `timestamp`, each matching how that app already stores epoch times), an optional nullable field on `SyncBookSchema`, and both sync directions wired. `getPeriodTotals` counts when a book was first finished rather than when it was last opened.

Three properties built in deliberately: the value is **sticky** (`COALESCE(sync_books.finished_at, excluded.finished_at)` server-side, and the client CASE only fills a null, so a client predating the field cannot clear a recorded finish); the crossing is stamped **in SQL** inside the existing position write rather than read-then-write, because position saves are frequent and every statement is a bridge crossing; and the backfill **does not need to propagate**, since it derives from values that already sync.

**C13 + S5** — Top Books groups by `COALESCE(seriesId, id)`, so a 400-chapter serial is one entry linking to the series page. Cards carry the D2-rationed line: speed and share of the work.

**B1** — `~N pages` on book detail, suppressed for serial chapters. **B2 + P7** — the card showed "Average RSVP target", i.e. the user's own slider; it now shows measured words per minute and which mode produced most of them. **S8 + D6** — the reader's estimate scales the RSVP dial by the reader's own delivered ratio from their last 50 sessions, and uses per-mode measured speed for scroll and page.

Two duplications collapsed: the 95% threshold existed in three places and is now one module; `225` had grown to three copies, one of which I had just added, and is now one exported constant. That is most of P6.

**Review found five real defects, two of them serious.**

A **Rules-of-Hooks violation** — the reading-rates hook was placed after two early returns, so any uncached book (cold start, deep link, tab restore) rendered a different number of hooks on the second pass and crashed the reader into an error boundary. No test covers reader rendering, so the suite stayed green.

The pull **reintroduced the very bug this task removes**. `updateBook` stamped `Date.now()`, but the sync pull replays a position change made on another device at another time. During the rollout window the server has no finish date to supply, so a book finished in March by an old client was stamped with today's date on the upgraded device, then made sticky. The stamp time is now a parameter and the pull passes the server's timestamp.

Also: the backfill excluded rows with a null `last_read`, which is exactly how a server-restored library arrives, so the devices most needing it were skipped — it now falls back to `added_at`, and skips chapter rows, which have no consumer and dominate serial libraries. `Record<string, unknown>` on the update patch had silently disabled drizzle's column typing in the function every position save passes through. And the measured-speed branch had no floor where the RSVP branch did, so a near-zero rate rendered "Infinityh".

One correctness fix of its own: the delivered ratio summed all RSVP rows for delivered but only dial-bearing rows for target, dividing one population by another. Both halves now come from the same rows, pinned by a test.
<!-- SECTION:FINAL_SUMMARY:END -->
