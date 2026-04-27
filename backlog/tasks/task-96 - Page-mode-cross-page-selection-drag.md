---
id: TASK-96
title: 'Page mode: cross-page selection drag'
status: To Do
assignee: []
created_date: '2026-04-27 19:45'
labels: []
milestone: m-5
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In page mode, long-pressing a word and dragging the end-handle past the visible page edge should auto-advance to the next page (or auto-retreat) so users can select text spanning multiple pages. Currently the handle drag stays bounded to the visible page; selection across pages is impossible.

Approach sketch:
- In useHighlightSelection, while a handle drag is in flight, watch for the pointer entering an edge zone (e.g. last 8% of pageWidth on either side).
- When in the edge zone for >X ms, call PageView's jumpTo / goNext / goPrev to advance.
- The selection range continues to extend across the new page's spans.

Edge cases:
- Crossing chunk boundaries within a single drag — would need the drag to stay alive while chunkIndex changes.
- Toolbar repositioning during auto-page-turn.
<!-- SECTION:DESCRIPTION:END -->
