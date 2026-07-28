---
id: TASK-159
title: 'Reading stats v2: correctness pass, period scope, per-book detail'
status: To Do
assignee: []
created_date: '2026-07-28 19:37'
labels: []
milestone: m-7
dependencies: []
documentation:
  - STATS-IMPROVEMENTS.md
priority: high
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Second pass over the reading-statistics feature shipped in TASK-46. The global stats page and the per-book stats card both display numbers that are wrong, and the page answers fewer questions than its controls imply.

Two distinct problem classes, deliberately kept apart:

1. **Correctness.** Independent review found 21 defects that silently corrupt the displayed numbers: a tracker bug that credits skipped text as words read, six timezone/DST errors in the aggregation maths, and several sync-integrity gaps. None of these are visible as errors; they present as plausible numbers. Everything in class 2 displays values produced by class 1, so correctness lands first.

2. **Information design.** The period tabs have no selected state at all (dead CSS in the shared UI package), and drive only three of the page's seven sections. The headline "reading speed" reports the user's own RSVP dial setting rather than any measurement. Durations render as raw minutes ("899m"). Book detail shows neither book length nor a usable speed history.

Full analysis, root causes with file:line, rejected alternatives, and the ordering constraints live in `STATS-IMPROVEMENTS.md` at the repo root. Each subtask names the item IDs it closes; that document supplies the reasoning behind each one. Read section 7 before starting any subtask, it defines what "done" means per item type and lists the six hard ordering dependencies.

Open design question in section 6 of that document blocks subtasks 5 and 7 only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All subtasks are Done
- [ ] #2 No displayed statistic is derived from an inflated words-read figure (C1 closed before any display work ships)
- [ ] #3 The aggregation and date maths have table tests covering a negative-UTC-offset timezone and a DST boundary
- [ ] #4 STATS-IMPROVEMENTS.md section 6 has a recorded decision before subtasks 5 and 7 begin
<!-- AC:END -->
