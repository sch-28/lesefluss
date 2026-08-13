---
id: TASK-164
title: 'Book management: editable metadata, status, rating, tags'
status: To Do
assignee: []
created_date: '2026-08-13 09:04'
labels: []
milestone: m-5
dependencies: []
documentation:
  - BOOK-MANAGEMENT.md
priority: high
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Parent task for the book management workstream. Books are write-once today: whatever the importer guessed for title/author is permanent, there is no description/rating/status/tags, and reading status is derived purely from reading position so "dropped" cannot be expressed.

Full scope, decisions and rationale live in BOOK-MANAGEMENT.md at the repo root. Read it before starting any subtask.

Key decisions (do not re-litigate):
- Status is sticky-manual: `status` column nullable, NULL = derive from progress, non-null = user set it and it never changes on its own.
- Statuses are want / reading / finished / dropped. No "paused".
- Tags are a JSON array column on `books`, not separate tables — they ride the existing book-row last-write-wins sync.
- Import confirm applies to file/clipboard/URL/share imports, never to catalog imports (Explore + onboarding).
- Deferred out of this workstream: cover editing, bulk/multi-select actions, collections, confirm step for serial imports.

Subtasks must be done in order: phase 1 is the sync foundation and everything else depends on it.
<!-- SECTION:DESCRIPTION:END -->
