---
id: TASK-226
title: >-
  Book and settings updatedAt clamp lets a fast-clock device re-win on every
  push
status: To Do
assignee: []
created_date: '2026-10-29 01:11'
labels: []
dependencies: []
priority: low
ordinal: 203000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From TASK-223 (2026-10-29): bookInsertValues and settings upsert clamp updatedAt to server now, but books are pushed in full every push (getBooksForSync), so a device whose clock runs ahead gets a fresh 'now' each push and overwrites newer edits from other devices until its clock is no longer ahead. Goals were reverted to raw stamps for this reason (see sync-goal-upsert.ts comment). Evaluate the same for books/settings (position and metadata LWW).
<!-- SECTION:DESCRIPTION:END -->
