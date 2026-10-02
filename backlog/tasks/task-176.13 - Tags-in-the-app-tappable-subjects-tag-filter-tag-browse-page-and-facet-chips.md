---
id: TASK-176.13
title: >-
  Tags in the app: tappable subjects, tag filter, tag browse page and facet
  chips
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:05'
updated_date: '2026-10-02 16:58'
labels:
  - explore
  - ux
dependencies:
  - TASK-176.1
references:
  - apps/capacitor/src/pages/_shared/detail-shell.tsx
  - apps/capacitor/src/pages/explore/index.tsx
  - apps/capacitor/src/pages/explore/genre-chips.tsx
documentation:
  - EXPLORE-SCOPE.md
modified_files:
  - apps/catalog/src/routes/books.ts
  - apps/capacitor/src/pages/_shared/detail-shell.tsx
  - apps/capacitor/src/pages/explore/book-detail.tsx
  - apps/capacitor/src/pages/explore/explore-search.ts
  - apps/capacitor/src/pages/explore/filter-row.tsx
  - apps/capacitor/src/pages/explore/tags.tsx
  - apps/capacitor/src/routes/tabs/explore/tags.tsx
  - apps/capacitor/src/routeTree.gen.ts
  - apps/capacitor/src/pages/explore/landing.tsx
  - apps/capacitor/src/pages/_shared/__tests__/detail-shell-tags.test.tsx
  - apps/capacitor/src/pages/explore/__tests__/explore-search.test.ts
  - apps/capacitor/e2e/explore-browse.spec.ts
parent_task_id: TASK-176
priority: high
ordinal: 108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: a reader who wants short stories (or ghost stories, sea stories, satire...) has no way to find them. Catalog subjects render as plain, non-interactive pills on the detail page (`detail-shell.tsx`, capped at the first 8), and search cannot filter by them.

Depends on TASK-176.1, which provides normalized tag ids/labels on each book, a tag filter on `/search`, a tags listing endpoint with counts, and co-occurring tag facets on search responses.

Outcome: tags are a primary way to browse the catalog.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tapping a tag on a catalog detail page opens Explore results filtered to that tag
- [x] #2 Detail page shows all tags, collapsed behind 'more' when there are many
- [x] #3 Search results can be filtered by multiple tags, combined with query, language and genre
- [x] #4 Active tag filters are visible as removable chips above results
- [x] #5 Results show top co-occurring tags with counts as chips that add a filter when tapped
- [x] #6 A tag browse page lists tags by book count with a name filter and is reachable from the Explore landing
- [x] #7 Tag filters are part of the URL so back navigation and shared links restore them
- [x] #8 Searching for short stories by tag returns short-story collections from both Gutenberg and Standard Ebooks
- [x] #9 Tests cover tag tap navigation, multi-tag filtering and URL restore
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. API: /books/:id returns `tags: [{id,label}]` (book order).
2. Explore URL state gains `tags` (comma list). Catalog results pass tags + `facets=tags`.
3. Filter row shows active tags as removable chips; facet chips "+ Label (count)" add a tag.
4. Detail page: tappable tag pills (DetailShell `tags` + `onTagTap`), all of them, collapsed after 8 behind "more". Tap navigates to /tabs/explore?tags=id.
5. Tag browse page /tabs/explore/tags: name filter, list by count from /tags, tap opens results. Linked from landing ("Browse by tag") and from the filter row.
6. Tests: explore-search URL parse/serialize round trip (multi-tag), component tests for tag tap navigation, facet add, chip removal; E2E for detail tag tap -> filtered results and back/reload restore.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
/books/:id now returns tags [{id,label}] in book order. DetailShell takes tags + onTagTap and shows them instead of raw subjects, 8 visible then 'N more'. Tag tap -> /tabs/explore?tags=id.

Tags are a comma list in the Explore URL (`tags=`), AND-combined with q/lang/genre/source/sort. Active tags show as removable chips; facet chips (+ label, count) come from the first results page (`facets=tags`). Labels of selected tags are remembered from facets, with an id-derived fallback.

/tabs/explore/tags lists /tags by count with a debounced name filter; linked from the landing genre grid ('Browse by tag') and the filter row.

AC8 is pinned by the catalog integration test (short-stories tag returns the SE and the Gutenberg fixture).

Tests: explore-search.test.ts (URL round trip, multi-tag), detail-shell-tags.test.tsx, e2e/explore-browse.spec.ts (tag tap -> results, reload + back restore, facet add/remove, tag page).

2026-10-02 decision (user): keep tag discovery on the separate "Browse by tag" page. Tag suggestions inside the main Explore search were considered and rejected; don't build them.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Tags are a primary browse path: tappable on catalog detail (all of them, collapsed after 8), filterable in results with removable chips and co-occurring facet chips, browsable on a new tag page linked from the landing, and kept in the URL so reload, back and shared links restore them.
<!-- SECTION:FINAL_SUMMARY:END -->
