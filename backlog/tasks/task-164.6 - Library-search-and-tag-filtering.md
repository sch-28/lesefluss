---
id: TASK-164.6
title: Library search and tag filtering
status: To Do
assignee: []
created_date: '2026-08-13 09:05'
updated_date: '2026-08-13 09:06'
labels: []
milestone: m-5
dependencies:
  - TASK-164.2
  - TASK-164.3
documentation:
  - BOOK-MANAGEMENT.md
parent_task_id: TASK-164
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The library offers sort and filter popovers but no way to find a book by name, and nothing surfaces the tags added by the edit sheet.

Add a search box over title and author, and tag chips in the filter popover. Both run client-side against the already loaded library list (useLibraryItems / filterAndSortLibrary), so no new queries are needed. The available tag set is the distinct union over the loaded books.

Depends on the tags column and the status filter rework from the earlier subtasks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Library header offers a search box matching on title and author, case-insensitive
- [ ] #2 Search composes with the existing status filter and sort rather than replacing them
- [ ] #3 Series are searchable by title alongside books
- [ ] #4 Filter popover lists the tags actually in use and filters the library by the selected one
- [ ] #5 A tag that no longer appears on any book disappears from the filter list
- [ ] #6 Empty-result state distinguishes an empty library from a search or filter with no matches
<!-- AC:END -->
