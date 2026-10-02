---
id: TASK-176.15
title: 'Explore results: sort, filter chip row, infinite scroll and list view'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:05'
updated_date: '2026-10-02 16:58'
labels:
  - explore
  - ux
dependencies:
  - TASK-176.2
references:
  - apps/capacitor/src/pages/explore/search-results.tsx
  - apps/capacitor/src/pages/explore/pagination.tsx
  - apps/capacitor/src/pages/explore/genre-chips.tsx
  - apps/capacitor/src/pages/explore/index.tsx
documentation:
  - EXPLORE-SCOPE.md
modified_files:
  - apps/capacitor/src/pages/explore/catalog-results.tsx
  - apps/capacitor/src/pages/explore/catalog-list-item.tsx
  - apps/capacitor/src/pages/explore/filter-row.tsx
  - apps/capacitor/src/pages/explore/language-label.ts
  - apps/capacitor/src/pages/explore/use-explore-lang.ts
  - apps/capacitor/src/pages/explore/index.tsx
  - apps/capacitor/src/routes/tabs/explore/index.tsx
  - apps/capacitor/src/services/catalog/client.ts
  - apps/capacitor/src/services/catalog/query-keys.ts
  - apps/capacitor/src/pages/explore/__tests__/catalog-results.test.tsx
  - apps/capacitor/src/pages/explore/__tests__/explore-lang.test.ts
  - apps/capacitor/e2e/explore-browse.spec.ts
  - agents/catalog.md
parent_task_id: TASK-176
priority: medium
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: catalog results are hard to browse:
- Sort cannot be chosen; the app derives relevance vs popular implicitly.
- Only one genre filter, shown as a single removable chip; language lives in the header select and reads as an app-wide setting; default language is hard-coded to English instead of the device/app locale.
- Numbered pagination on a phone grid forces scroll-to-top and tapping; page is component state, not URL.
- Grid only; text-heavy classics with generic covers scan better as a list (web novels already have a grid/list toggle).
- The genre and language lists are hard-coded in the app.

Depends on TASK-176.2, which provides explicit sort, source and author filters, and genre/language listing endpoints with counts.

Outcome: results feel like a real browse surface with visible, adjustable filters.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Users can choose a sort (relevance, popular, title, author, recently added)
- [x] #2 A horizontal filter row shows genre, language, source and (when available) length and tags as chips with dropdowns; active filters are visible and removable
- [x] #3 Genre and language options come from the API with counts; the app holds no hard-coded genre label map
- [x] #4 Default language follows the app/device locale when the catalog has books in it, else English
- [x] #5 Results load more on scroll instead of numbered pages on mobile
- [x] #6 Catalog results support a list view showing title, author, language and subjects
- [x] #7 Sort, filters and view mode live in the URL and survive back navigation with scroll position restored
- [x] #8 Tests cover filter combination, URL restore and infinite loading
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. URL is the source of truth for Explore browse state: q, genre, tags, lang, sort, source, view, scope. Pure parse/serialize module with tests.
2. Filter row (horizontal, scrollable chips with dropdown menus): Sort, Genre, Language, Source, Tags; active ones highlighted and removable. Length chip waits for TASK-176.3.
3. Genres from /genres, languages from /languages, both with counts; LANG_OPTIONS and the header language select removed.
4. Default language: URL > stored choice > device locale (navigator.language) if /languages lists books for it > en.
5. Results: useInfiniteQuery + IntersectionObserver sentinel; numbered pagination removed. Query cache keeps loaded pages so back navigation restores scroll.
6. Catalog list view (title, author, language, subjects) via ViewModeToggle; view mode in URL.
7. Tests: URL round trip, filter combination, infinite loading (sentinel triggers next page), list view.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Filter row: Sort, Genre (from /genres with counts), Language (from /languages with counts, Intl.DisplayNames labels), Source, Tags button, then active-tag and facet chips. Relevance is only offered with a query. Length chip deferred to TASK-176.3 (AC says 'when available').

LANG_OPTIONS and the header language select are gone. useExploreLang: URL -> stored choice -> device locale if /languages has books for it -> en; a first-time non-English device waits for /languages instead of fetching twice.

Results: useInfiniteQuery (24 per page) with an IntersectionObserver sentinel (600px rootMargin); pagination.tsx, search-results.tsx and genre-chips.tsx removed. Back navigation restores scroll because loaded pages stay in the query cache.

List view (catalog-list-item.tsx): title, author, language, first 3 subjects, in-library badge, quick add. view=list in the URL; the header shows the toggle in catalog mode.

Tests: catalog-results.test.tsx (all filters sent together, facets on page 1 only, infinite loading and stop, list view, zero-result actions), explore-lang.test.ts, e2e sort+source+tags URL round trip and scroll restore after a detail round trip.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Catalog results have a chip filter row (sort, genre and language from the API with counts, source, tags), load more on scroll, offer a list view, and keep sort, filters and view in the URL so back navigation restores both state and scroll position. The default language follows the device locale when the catalog has books in it.
<!-- SECTION:FINAL_SUMMARY:END -->
