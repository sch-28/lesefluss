---
id: TASK-205.12
title: >-
  Reading ruler: center the band on the active line of a multi-line chapter
  heading
status: To Do
assignee: []
created_date: '2026-10-28 21:35'
labels: []
milestone: m-14
dependencies: []
parent_task_id: TASK-205
priority: low
ordinal: 196000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up from the TASK-205.5 verification. The heading fallback in pages/reader/reading-ruler.ts uses the heading's single block rect from getClientRects() and centres a line-height band on it. For a chapter title that wraps to 2+ lines, the band straddles both lines (half of each). Fix: use a Range over the heading's text nodes to get per-line rects, and pick the line containing the heading word (or the first line).
<!-- SECTION:DESCRIPTION:END -->
