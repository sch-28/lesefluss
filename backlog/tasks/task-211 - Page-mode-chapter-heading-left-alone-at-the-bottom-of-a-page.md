---
id: TASK-211
title: 'Page mode: chapter heading left alone at the bottom of a page'
status: To Do
assignee: []
created_date: '2026-10-26 03:15'
labels:
  - reader
  - page-mode
  - ui
milestone: m-14
dependencies: []
priority: low
ordinal: 184000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen in the TASK-206.3 real-Chrome pass (Morning Star, Chapter 33, page mode): Chromium left the chapter heading at the bottom of its column despite `.reader-heading { break-after: avoid }`, so the chapter body starts on the next page. Multi-column layout ignores break-after:avoid in Chromium in many cases. Find a working way to keep a heading with its first paragraph (e.g. wrap heading + first paragraph in a break-inside:avoid block, or measure and push the heading). Must not change saved positions or the page-mode re-anchor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A heading that would end a page moves to the next page together with its first lines (e2e or screenshot check in page mode)
- [ ] #2 Page-mode position specs (page-mode-*, chapter jumps) stay green; no saved-word change
<!-- AC:END -->
