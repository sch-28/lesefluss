---
id: TASK-164.7
title: Show book metadata on the website profile
status: To Do
assignee: []
created_date: '2026-08-13 09:06'
updated_date: '2026-08-13 09:06'
labels: []
milestone: m-5
dependencies:
  - TASK-164.1
documentation:
  - BOOK-MANAGEMENT.md
parent_task_id: TASK-164
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The /profile page on the website lists a signed-in user's library and highlights from sync_books, but knows nothing about rating, status, tags or description, so a book edited in the app looks unchanged on the web.

Surface those fields read-only, deriving status through bookStatus() from packages/core so the website and the app agree on what "finished" means. Editing stays in the app.

apps/web/src/lib/profile.ts currently carries its own FINISHED_THRESHOLD constant; the phase 1 subtask replaces it with the shared helper, and this task should be built on top of that rather than reintroducing a local copy.

Depends on the phase 1 subtask.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Profile page shows rating, status, tags and description for each book, with absent fields rendering nothing rather than empty labels
- [ ] #2 Status is derived through bookStatus() from packages/core, not a website-local threshold
- [ ] #3 The page stays read-only, with no edit controls
- [ ] #4 Books synced from a client that predates these fields render without errors
<!-- AC:END -->
