---
id: TASK-210
title: 'Scroll reader: real input during a jump''s landing cancels the landing align'
status: To Do
assignee: []
created_date: '2026-10-26 03:15'
labels:
  - reader
milestone: m-14
dependencies: []
priority: low
ordinal: 183000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pre-existing (seen in the TASK-206.1 real-Chrome rechecks at 1 fps): a wheel made while a TOC/search jump is still landing is overridden by the landing's fine align and the jump hold, putting the view back on the target. At normal frame rates the landing takes ~100 ms, at 1 fps several seconds. Let real reader input during a landing cancel the fine align, without ever saving the half-landed word.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A wheel/touch/key during a jump landing at 1 fps moves the view and the next settle saves the reader's word, not the jump target and not a half-landed word (e2e in the @lowfps lane)
- [ ] #2 Jump landings without input are unchanged (existing jump specs green)
<!-- AC:END -->
