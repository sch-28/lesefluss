---
id: TASK-159.6
title: 'Stats step 5: context numbers on both surfaces (S5, B1, B2, S8, P1, P7, C13)'
status: To Do
assignee: []
created_date: '2026-07-28 19:39'
updated_date: '2026-07-28 19:40'
labels: []
milestone: m-7
dependencies:
  - TASK-159.2
documentation:
  - STATS-IMPROVEMENTS.md
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
- [ ] #1 A top book card conveys reading speed and share of the book covered without a layout redesign
- [ ] #2 Book detail states the book's length in pages and words, suppressed for series chapters
- [ ] #3 Time-remaining estimates use measured speed in scroll and page modes
- [ ] #4 RSVP time-remaining responds immediately to a dial change and does not systematically underestimate
- [ ] #5 A book finished months ago and reopened today is not recounted as finished today
- [ ] #6 Books finished before session tracking existed still appear in all-time totals
- [ ] #7 Speed figures state which mode produced them
- [ ] #8 A multi-chapter serial aggregates as one work in Top Books, and has a stats surface on the series page
<!-- AC:END -->
