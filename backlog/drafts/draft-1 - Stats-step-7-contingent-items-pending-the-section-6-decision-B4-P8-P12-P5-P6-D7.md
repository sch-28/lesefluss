---
id: DRAFT-1
title: >-
  Stats step 7: contingent items pending the section 6 decision (B4, P8, P12,
  P5, P6, D7)
status: Draft
assignee: []
created_date: '2026-07-28 19:40'
labels: []
milestone: m-7
dependencies: []
documentation:
  - STATS-IMPROVEMENTS.md
parent_task_id: TASK-159
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deliberately a Draft. Every item here is challenged on grounds of value rather than correctness, and section 6 of `STATS-IMPROVEMENTS.md` may remove several of them outright. Promote to To Do only after that decision is recorded.

The open question: the stats page is seven sections, six different time windows, four charts and roughly twenty numbers, with no statement about what the reader should conclude. The plan that produced this task originally added roughly fifteen more numbers and, across 25 items, proposed no deletions. The alternative is a smaller page answering three questions in order (am I reading / how much / how fast), which would dissolve several items rather than build them.

**D7 — session segments, if any.** Three options in ascending cost: shorten session boundaries with no schema change; add a `segments` TEXT column to `reading_sessions` holding a compact delta array, which rides the existing sync row and follows the established JSON-in-TEXT pattern (`chapters`, `linkRanges`); or the original `reading_session_segments` child table. Option 2 appears to get most of the value for a fraction of the machinery. Before choosing, answer what sentence a user says after looking at the resulting chart: a speed dip between 40% and 45% has at least four indistinguishable causes and no attached action. Must come after C1 either way, since segments derived from an inflated `maxPos` are inflated segments.

**B4 — speed over book position.** Buildable today with no schema change from `startWord`/`endWord`, `books.wordCount` and `book_content.chapters`. Piecewise flat by construction unless D7 lands. Needs a legacy path for pre-segment sessions regardless.

**P8 — chapter-level speed table.** Wants D7 for meaningful resolution, since one session routinely spans several chapters.

**P12 — text summaries for the four charts.** Currently the only `aria-*` in the stats directory is one `aria-hidden`. Justified partly by making TASK-117 (Share stats) smaller, which is speculative until 117 is scheduled.

**P5 — all-time numbers.** Smaller than originally written: `period-totals.tsx:10` already has an `all` period mapping to `start: 0`, so all-time minutes, words and books finished exist today. Only average session length, average speed and a comparison line are missing.

**P6 — reconcile the average-reader baseline.** `wpm-trend.tsx:14` says 225, `task-46.3:88` says 250, `reader/index.tsx:1377` hardcodes 250. Three values, unsourced. Reconcile and either source it or label it as rough before displaying it more widely; do not promote it to a shared package while it means nothing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Section 6 of STATS-IMPROVEMENTS.md records a decision on page structure before any item here starts
- [ ] #2 D7 is resolved with a stated answer to what a user does with the resulting chart
- [ ] #3 Items that the structure decision removes are struck from the document rather than silently dropped
- [ ] #4 The average-reader baseline has one value and a stated source or an honest label
<!-- AC:END -->
