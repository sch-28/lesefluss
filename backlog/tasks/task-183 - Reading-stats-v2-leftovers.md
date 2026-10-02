---
id: TASK-183
title: Reading stats v2 leftovers
status: To Do
assignee: []
created_date: '2026-10-02 16:59'
labels:
  - stats
milestone: m-14
dependencies: []
references:
  - STATS-IMPROVEMENTS.md
priority: low
ordinal: 129000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Four acceptance criteria were left unchecked when the TASK-159 subtasks were closed. They are collected here so TASK-159 could close.

- From TASK-159.3 (AC #10): `getStreak`, `getHourHistogram` and `getPersonalityStats` scan the whole sessions table with no bound.
- From TASK-159.4 (AC #3): a session whose write loses a race can end up below the push watermark (`sync_sessions_pushed_at`) and never reach the server.
- From TASK-159.6 (AC #8): Top Books counts each chapter of a multi-chapter serial separately instead of as one work.
- From TASK-159.7 (AC #3): the speed chart's x-axis does not show the time gaps between sessions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Streak, hour-histogram and personality stats queries are bounded or indexed so cost does not grow with full session history
- [ ] #2 A session row written after a concurrent push still reaches the server on a later push
- [ ] #3 Top Books groups the chapters of a serial into one work
- [ ] #4 The speed chart's x-axis reflects the real time between sessions
<!-- AC:END -->
