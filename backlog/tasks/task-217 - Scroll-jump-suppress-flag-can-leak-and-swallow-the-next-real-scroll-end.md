---
id: TASK-217
title: 'Scroll jump: suppress flag can leak and swallow the next real scroll end'
status: To Do
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-27 00:38'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-27 lese-worker (from TASK-219): the single-shot suppress flag can also be cleared too early, the other way round. The voice-follow smoothScrollBy (250 ms) sets suppressNextScrollEndRef, but before the animation's real end the flag can be (a) consumed by virtua's 150 ms scroll-end debounce firing mid-animation on a long frame, or (b) cleared by clearIfJumpDidNotScroll when a zero or sub-pixel first tick produces no scroll event within 2 frames (t isn't clamped at 0, so a rAF timestamp before startTime gives a tiny or reversed step). The animation's real end then reaches the reader as a settle. TASK-219 made that harmless while following (a settle with no reader input is the view's own scroll). The root fix belongs here: swallow animated scrolls by time, not by a single flag. Re-arm the suppression in smoothScrollBy's last tick and clear it after the animation's scroll end; clamp t ≥ 0. I didn't reproduce it deterministically: CPU throttling and a 250 ms long task mid-animation both left the end suppressed.
<!-- SECTION:NOTES:END -->
