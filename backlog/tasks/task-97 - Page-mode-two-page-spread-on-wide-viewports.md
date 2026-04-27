---
id: TASK-97
title: 'Page mode: two-page spread on wide viewports'
status: To Do
assignee: []
created_date: '2026-04-27 19:45'
labels: []
milestone: m-5
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On tablet / desktop viewports above a breakpoint (~900px), render two pages side by side instead of one wide column. Standard e-reader behavior on landscape tablets and desktop web.

Implementation hint: the multicol container can use `column-count: 2` instead of single `column-width`. The translateX math becomes pageIndex * (2*pageWidth) per spread. Tap zones split into 4 (left page prev, left page center, right page center, right page next) or stay as 3 with current semantics.

Should be straightforward given the current explicit-pixel multicol setup.
<!-- SECTION:DESCRIPTION:END -->
