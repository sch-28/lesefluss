---
id: TASK-67
title: 'Explore/discovery: short reads filter'
status: Done
assignee: []
created_date: '2026-04-26 15:59'
updated_date: '2026-10-02 16:59'
labels: []
dependencies:
  - TASK-176.3
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Quick reads genre on catalog.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Needs per-book word counts in the catalog, which TASK-176.3 adds. Once those exist, the filter UI can sit in the Explore filter chip row (TASK-176.15). Overall plan: TASK-176 / EXPLORE-SCOPE.md.

Closed in backlog cleanup 2026-10-02: shipped via TASK-176.3 (length filter, 'Under 1 hour' bucket in apps/capacitor/src/pages/explore/length.ts, catalog min_words/max_words, 'Shortest first' sort).
<!-- SECTION:NOTES:END -->
