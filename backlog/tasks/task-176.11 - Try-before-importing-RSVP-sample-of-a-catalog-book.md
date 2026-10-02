---
id: TASK-176.11
title: 'Try before importing: RSVP sample of a catalog book'
status: To Do
assignee: []
created_date: '2026-10-01 10:05'
labels:
  - explore
  - reader
milestone: m-6
dependencies: []
references:
  - apps/capacitor/src/pages/explore/book-detail.tsx
documentation:
  - EXPLORE-SCOPE.md
parent_task_id: TASK-176
priority: low
ordinal: 106000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: Lesefluss's distinguishing feature is RSVP reading, yet a reader must import a whole book before trying it. A short sample in the RSVP reader from the detail page lets people judge both the book and the reading mode without filling their library.

Outcome: a catalog detail page can play the opening of the book in RSVP without importing it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Catalog detail offers a 'Sample' action for books with an EPUB
- [ ] #2 The sample plays the opening text (skipping front matter where detectable) in the RSVP reader at the user's WPM
- [ ] #3 Sampling does not add the book to the library or create reading sessions/stats
- [ ] #4 The sample ends with options to import or go back
- [ ] #5 Works offline-failure gracefully with retry
<!-- AC:END -->
