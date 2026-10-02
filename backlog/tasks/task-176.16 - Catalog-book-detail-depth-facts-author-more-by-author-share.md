---
id: TASK-176.16
title: 'Catalog book detail depth: facts, author, more by author, share'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:05'
updated_date: '2026-10-01 11:39'
labels:
  - explore
  - ux
milestone: m-6
dependencies:
  - TASK-176.2
  - TASK-176.3
references:
  - apps/capacitor/src/pages/explore/book-detail.tsx
  - apps/capacitor/src/pages/_shared/detail-shell.tsx
documentation:
  - EXPLORE-SCOPE.md
modified_files:
  - apps/catalog/src/routes/books.ts
  - apps/catalog/src/routes/__tests__/browse.integration.test.ts
  - apps/capacitor/src/services/catalog/client.ts
  - apps/capacitor/src/services/catalog/query-keys.ts
  - apps/capacitor/src/pages/explore/book-detail.tsx
  - apps/capacitor/src/pages/explore/book-detail-shelves.tsx
  - apps/capacitor/src/pages/explore/catalog-facts.ts
  - apps/capacitor/src/pages/explore/share-link.ts
  - apps/capacitor/src/pages/explore/explore-search.ts
  - apps/capacitor/src/pages/explore/filter-row.tsx
  - apps/capacitor/src/pages/explore/search-field.tsx
  - apps/capacitor/src/pages/_shared/detail-shell.tsx
  - apps/capacitor/src/pages/explore/__tests__/catalog-facts.test.ts
  - apps/capacitor/src/pages/explore/__tests__/book-detail.test.tsx
parent_task_id: TASK-176
priority: medium
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: the catalog detail page shows cover, title, author, description and raw subjects, nothing else. Readers deciding on a book want length and estimated reading time at their own WPM, language, era, and source edition. The author name is not tappable, and there is no "more by this author" or "similar books". There is no way to share a book although the route is deep-linkable. `DetailShell` already supports a `facts` badge row; the catalog page passes none.

Depends on TASK-176.2 (author filter) and TASK-176.3 (word count). Tag tapping is covered by the tags-in-the-app subtask.

Outcome: the detail page answers "should I read this?" and leads to the next book.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Detail shows facts: length, estimated reading time at the user's current WPM, language, source (SE/Gutenberg) and author years when known
- [x] #2 Facts with no data are omitted, not shown empty
- [x] #3 Tapping the author opens results for that author
- [x] #4 A 'More by this author' shelf appears when the author has other books, excluding the current one
- [x] #5 A 'Similar books' shelf appears based on shared tags/genre
- [x] #6 A share action shares a link that opens this detail page
- [x] #7 Tests cover facts rendering with and without data, author navigation and shelves
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. API: /books/:id adds authorBirthYear/authorDeathYear; new GET /books/similar/:id{.+} (registered before the detail wildcard): books sharing the most tags, same primary language, excluding the book itself and its own author's books, by overlap then popularity.
2. Facts via a pure catalogFacts(book, wpm): words, reading time at the reader's wpm, language, source, author years; missing data omitted.
3. Explore URL gains `author` (catalog filter, removable chip). DetailShell gets onAuthorTap; tapping opens /tabs/explore?author=.
4. Shelves under the description: "More by <author>" (/search?author=, current book excluded, hidden when empty, See all -> author results) and "Similar books" (hidden when empty).
5. Share header action: native share sheet, copy link on web; link is the web build URL /app/tabs/explore/book/<id> (works everywhere; claiming it as an App Link is out of scope per docs/deep-links.md).
6. Tests: catalogFacts with/without data, similar route (DB), author tap navigation + shelves (component), share fallback.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
API: /books/:id adds authorBirthYear/authorDeathYear (Gutenberg only, filled by the next sync). New GET /books/similar/:id{.+}, registered before the detail wildcard: shared-tag overlap, same primary language, excluding the book and its author (by author key), then popularity; ~13 ms locally. DB-gated route test.

App: catalog-facts.ts (words, reading time at the reader's wpm, language, source, author years; unknowns omitted). Author is a button (DetailShell onAuthorTap) -> /tabs/explore?author=; `author` is a new Explore URL filter with a removable 'By X' chip. book-detail-shelves.tsx: More by <author> (own catalogKeys.byAuthor key, current book filtered out, See all -> author results) and Similar books; both hide when empty. Share header action: native share sheet, copy link on web; URL is <origin>/app/tabs/explore/book/<id> (the web build), since the app does not claim /app paths per docs/deep-links.md.

Also: search field maxLength 200 to match the catalog's q cap.

Tests: catalog-facts.test.ts, book-detail.test.tsx (facts, author tap, shelves incl. empty/self-exclusion, web share copy), catalog similar route test.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Catalog detail now shows length, reading time at the reader's speed, language, source and author years (unknowns omitted), a tappable author that opens author results, 'More by this author' and 'Similar books' shelves that hide when empty, and a share action whose link opens the page in the web app.
<!-- SECTION:FINAL_SUMMARY:END -->
