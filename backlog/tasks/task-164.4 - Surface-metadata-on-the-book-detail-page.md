---
id: TASK-164.4
title: Surface metadata on the book detail page
status: To Do
assignee: []
created_date: '2026-08-13 09:05'
updated_date: '2026-08-13 09:06'
labels: []
milestone: m-5
dependencies:
  - TASK-164.3
documentation:
  - BOOK-MANAGEMENT.md
parent_task_id: TASK-164
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pages/library/book-detail.tsx renders cover, facts, chapters, journey, highlights and sessions, with Delete as its only header action. None of the new metadata has a home yet.

Surface rating, status, description, tags and review on the page, and add an entry point to the edit sheet from both the detail page header and the library long-press action sheet (pages/library/index.tsx).

DetailShell currently accepts a single headerAction and needs to accept more than one for Edit to sit beside Delete.

Note the existing hook-order constraint in book-detail.tsx: hooks must stay above the isPending / !book early returns, or the first render transition throws React error #310.

Depends on the edit sheet subtask.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Rating, status, description, tags and review are visible on the detail page, and absent fields leave no empty scaffolding behind
- [ ] #2 Detail page header offers Edit alongside Delete
- [ ] #3 Library long-press action sheet offers Edit
- [ ] #4 DetailShell accepts multiple header actions without changing existing call sites' behaviour
- [ ] #5 Editing from either entry point updates the page without a manual reload
- [ ] #6 A book with none of the new fields set looks no worse than it does today
<!-- AC:END -->
