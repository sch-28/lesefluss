---
id: TASK-217
title: 'Scroll jump: suppress flag can leak and swallow the next real scroll end'
status: To Do
assignee: []
created_date: '2026-10-26 03:15'
labels:
  - reader
  - bug
milestone: m-14
dependencies: []
priority: low
ordinal: 190000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the independent TASK-206 verification (narrow). jumpTo resets jumpScrolledRef only at its start; the scrollToIndex scroll sets it, then a clamped fine align (end of book) re-sets suppressNextScrollEnd with no scroll end to consume it; landed() → clearIfJumpDidNotScroll keeps it. With no hold (word 0 / leading figures) nothing clears it, and the next real scroll end is swallowed (ticks still flush on unmount). markInitialSettled resets it correctly; jumpTo doesn't. Fix: reset the jump-scroll bookkeeping like markInitialSettled, or tag programmatic scrolls by target offset (see the input-gated saving task).
<!-- SECTION:DESCRIPTION:END -->
