---
id: TASK-220
title: >-
  Scroll reader: reader-input window closes before the settle (selection drag,
  middle-click autoscroll)
status: To Do
assignee: []
created_date: '2026-10-27 01:10'
labels:
  - reader
  - bug
  - read-aloud
milestone: m-14
dependencies: []
priority: low
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the TASK-219 verification (2026-10-27), desktop web only. use-anchor-hold's letGo (pointerup) and endAutoscroll (the click/Esc that stops middle-click autoscroll) reset readerInputUntilRef to 0 immediately, but the settle check runs at virtua's scroll end ~150 ms after the last scroll. A selection dragged past the edge and released mid-scroll, or an autoscroll stopped by a click/Esc, then reads isReaderScrolling() false at settle time: while read-aloud is paused and following, the settle is treated as the view's own scroll, the spoken word is restored and play reads from the old spot.

Also: noteScroll zeroes a finite key window on the first scroll while a hold is pending (QUIET_MS 300 ms), so a native key scroll with focus on a link in the text that lands in that window is swallowed.

Fix: on letGo/endAutoscroll set readerInputUntilRef = now + ~500 ms instead of 0, or latch a "reader scrolled since the last settle" flag on any scroll while input is live and clear it in handleScrollEnd. Add e2e: selection drag past the edge while paused + following saves the reader's spot; focused-link ArrowDown; the swallowed-settle test asserts the underline/progress come back. Also fix the scroll-view comments/notes that say "key or button" (only keyboard shortcuts call handle.scrollBy).
<!-- SECTION:DESCRIPTION:END -->
