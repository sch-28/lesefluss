---
id: TASK-164.6
title: Library search and tag filtering
status: Done
assignee:
  - sch-28
created_date: '2026-08-13 09:05'
updated_date: '2026-08-13 23:18'
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
- [x] #1 Library header offers a search box matching on title and author, case-insensitive
- [x] #2 Search composes with the existing status filter and sort rather than replacing them
- [x] #3 Series are searchable by title alongside books
- [x] #4 Filter popover lists the tags actually in use and filters the library by the selected one
- [x] #5 A tag that no longer appears on any book disappears from the filter list
- [x] #6 Empty-result state distinguishes an empty library from a search or filter with no matches
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
`filterAndSortLibrary` now takes a `LibraryView` options object rather than five positional arguments; search and tag are optional so the shape reads as 'what is currently narrowing the library'.

Two judgement calls worth knowing. A tag filter hides series, because series carry no tags and cannot match one. And the library page falls back to showing everything when the active tag stops existing (its last book edited or deleted), rather than leaving the reader staring at an empty grid with no way back.

`FilterPopover` stopped using `SelectionPopover`: that component models one exclusive choice, and the filter menu now carries two independent axes (shelf and tag). SelectionPopover still owns the Sort menu, so nothing is orphaned.

Verified on device against the real library: searching 'sanderson' narrowed 9 books to the 3 by that author (matching on the author field, not just the title), the TAGS section appeared only once books carried tags, and selecting 'epic fantasy' narrowed to exactly the book holding it. Seeded tags cleared afterwards; library back to 9 books, zero residue, every reading position unchanged.

10 new unit tests cover case-insensitivity, whitespace trimming, series-by-title, search composing with the status filter, tag matching, the distinct sorted tag list, and series being hidden under a tag filter.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The library can now be searched and filtered by tag.

A search icon in the header toggles a search row that matches title and author case-insensitively, and series by title. It composes with the shelf filter and the sort rather than replacing them, so "dropped books matching red" is expressible.

Tags appear as a second section in the filter popover, listed only when books actually carry them, with an "Any tag" row to clear the selection. The tag set is the distinct union over the loaded library, so a tag stops being offered the moment its last book loses it, and an active tag that disappears falls back to showing everything.

Both run client-side over the already loaded list, so there is no new query and nothing to debounce.

The empty state now distinguishes a library narrowed to nothing ("No books match.") from one that is genuinely empty.

Verified on device against a real 9-book library, with the seeded tags cleared afterwards.
<!-- SECTION:FINAL_SUMMARY:END -->
