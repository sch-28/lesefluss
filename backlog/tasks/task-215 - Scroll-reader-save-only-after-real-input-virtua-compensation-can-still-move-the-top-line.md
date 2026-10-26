---
id: TASK-215
title: >-
  Scroll reader: save only after real input (virtua compensation can still move
  the top line)
status: To Do
assignee: []
created_date: '2026-10-26 03:15'
labels:
  - reader
  - bug
milestone: m-14
dependencies: []
priority: medium
ordinal: 188000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the independent TASK-206 verification (2026-10-26). Rare residual phantom line in scroll mode: virtua 0.48.8's ACTION_ITEM_RESIZE rule compensates an item straddling the top edge by its full growth whenever the last native scroll was downward (until scrollend) or a programmatic scroll is pending. A top paragraph growing below the edge (goal divider appearing, discussion marker count, late figure) moves the text at the edge; the content-based hasMoved sees a real move and saves one line off; inside a hold it classifies as 'others' and releases.

Related lower findings: a reflow start() during a touch fling (late font load / synced setting) aims at the pre-fling tick paragraph and drags the view back (settling phase has no 'others' exit; begin() zeroes readerInputUntil); sub-4 px moves never accumulate (settledTopRef advances on every scroll end); virtua's scrollBy re-target loop can undo a correction within 150 ms, so each late measurement costs 2 of MAX_CORRECTIONS; the !hasMoved restore runs before the jump guard.

Structural direction (matches the deferred save-on-intent design, docs doc-4..doc-7): gate onPositionSettle on an input-seen-since-last-programmatic-scroll bit; tag programmatic scrolls by target offset instead of the single-shot suppress flag; write settledWordRef where lastWordRef is set for jumps; build a virtua-faithful unit harness (scrollBy async/retargeting, compensation that moves text).
<!-- SECTION:DESCRIPTION:END -->
