---
id: TASK-97
title: 'Page mode: two-page spread on wide viewports'
status: To Do
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
labels: []
milestone: m-13
dependencies: []
priority: high
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On tablet / desktop viewports above a breakpoint (~900px), render two pages side by side instead of one wide column. Standard e-reader behavior on landscape tablets and desktop web.

Implementation hint: the multicol container can use `column-count: 2` instead of single `column-width`. The translateX math becomes pageIndex * (2*pageWidth) per spread. Tap zones split into 4 (left page prev, left page center, right page center, right page next) or stay as 3 with current semantics.

Should be straightforward given the current explicit-pixel multicol setup.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 owner decision: keep 3 tap zones with current semantics across the whole spread. Code refs at f8d79ba: pageWidth page-view/index.tsx:241, translateX :286/:538-540, tap zones :665-666, swipe threshold :787, page-from-x measurements.ts:40,:62, column styles chunk-content.tsx:175-179.
<!-- SECTION:NOTES:END -->
