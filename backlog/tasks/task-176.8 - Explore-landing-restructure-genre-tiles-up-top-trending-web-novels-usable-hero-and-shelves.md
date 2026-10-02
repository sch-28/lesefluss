---
id: TASK-176.8
title: >-
  Explore landing restructure: genre tiles up top, trending web novels, usable
  hero and shelves
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:04'
updated_date: '2026-10-01 19:29'
labels:
  - explore
  - ux
milestone: m-6
dependencies: []
references:
  - apps/capacitor/src/pages/explore/landing.tsx
  - apps/capacitor/src/pages/explore/hero.tsx
  - apps/capacitor/src/pages/explore/shelf.tsx
  - apps/capacitor/src/pages/explore/web-novels-section.tsx
  - TASK-68
documentation:
  - EXPLORE-SCOPE.md
modified_files:
  - apps/catalog/src/routes/landing.ts
  - apps/catalog/src/lib/genres.ts
  - apps/catalog/src/lib/search-params.ts
  - apps/catalog/src/routes/search.ts
  - apps/catalog/src/routes/__tests__/browse.integration.test.ts
  - apps/catalog/src/routes/__tests__/landing-rotation.test.ts
  - apps/capacitor/src/pages/explore/landing.tsx
  - apps/capacitor/src/pages/explore/hero.tsx
  - apps/capacitor/src/pages/explore/shelf.tsx
  - apps/capacitor/src/pages/explore/shelf-frame.tsx
  - apps/capacitor/src/pages/explore/browse-row.tsx
  - apps/capacitor/src/pages/explore/trending-web-novels.tsx
  - apps/capacitor/src/pages/explore/grouped-results.tsx
  - apps/capacitor/src/pages/explore/index.tsx
  - apps/capacitor/src/pages/explore/explore-search.ts
  - apps/capacitor/src/services/catalog/client.ts
  - apps/capacitor/src/pages/explore/__tests__/landing.test.tsx
  - apps/capacitor/src/pages/explore/__tests__/hero.test.tsx
  - apps/capacitor/src/pages/explore/__tests__/shelf-frame.test.tsx
parent_task_id: TASK-176
priority: medium
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: the landing is a long stack of identical shelves: Hero, Featured, Classics, Most read, Random, then all 8 genres as shelves, then the same 8 genres again as a button grid. Specific problems:
- Hero carousel has no swipe on a touch-first app, pauses only on mouse hover, ignores reduced-motion, has 6px dot tap targets, and shows "first 6 classics" with only title/author.
- Shelves have no scroll arrows on the desktop web build; only genre shelves have "See all".
- The web-novels section is a provider picker, not content, although a popular-serials query exists.
- No "recently added" shelf.
- No curated collections; Gutenberg bookshelves (see the catalog tags subtask) and TASK-68 articles would fit here.

Outcome: a shorter, varied landing that leads with ways to browse and shows real content from both catalog and web novels.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Genre/tag tiles appear near the top as one horizontal row; the duplicate bottom genre grid is removed
- [x] #2 Per-genre shelves are reduced to a small rotating set instead of all genres
- [x] #3 Hero supports swipe, pauses on touch interaction, respects prefers-reduced-motion, has tap targets of at least 24px, and shows a one-line summary plus primary action
- [x] #4 Every shelf has a 'See all' that opens the matching filtered results
- [x] #5 Shelves show scroll arrows on pointer devices
- [x] #6 A trending web-novels shelf shows actual series; provider entry points remain available but secondary
- [x] #7 A recently-added catalog shelf exists
- [x] #8 Landing remains usable when any individual shelf fails to load
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Server: /landing loads each shelf independently (allSettled, `failed` lists shelf names), adds recently_added (added_at), rotates 3 genres per UTC day, validates lang; Genre.onLanding removed. /search without any filter now browses the language (needed for See all on Most read / Recently added). Client: BrowseRow (genre tiles from /genres + Browse by tag) at the top, bottom grid removed; Hero rewritten; shared ShelfFrame with See all and pointer arrows; TrendingWebNovels shelf from usePopularSerials. Landing order (revised at the user's request): browse row, hero, personal shelves, web-novels block (Trending web novels, then provider cards), then catalog shelves: recently added, most read, Standard Ebooks, rotating genres, random.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hero: swipe (40px), pauses on hover/focus and for 10 s after a touch, no auto-advance under prefers-reduced-motion, 24px dot targets, one-line summary and a View book action.

See all mapping: Recently added -> scope=catalog&sort=recent; Most read -> scope=catalog&sort=popular; Standard Ebooks -> source=standard_ebooks&sort=recent; genres -> genre; Random -> source=standard_ebooks; Trending -> /tabs/explore/web-novels. exploreMode treats scope=catalog alone as catalog results, and the server no longer 400s an unfiltered search (stale-only filters still answer empty).

Failure isolation: a failed shelf shows its own Retry; if /landing fails entirely, the browse row, trending web novels, random shelf and provider cards still render.

Classics stay as hero content only (no See all equivalent).

Curated Gutenberg-bookshelf shelf: skipped. Bookshelves only arrive with the next full Gutenberg sync (none locally), so it could not be built or checked. Follow-up candidate.

Tests: landing.test.tsx (tiles, See all per shelf, per-shelf failure, whole-landing failure, skeletons), hero.test.tsx (auto-advance, reduced motion, swipe + touch pause, 24px dots), shelf-frame.test.tsx (arrows only on fine pointers), catalog landing integration + genresForDay unit tests.

Order change requested by the user: web novels sit together right after the hero (after the personal shelves when they render): Trending web novels, then the provider cards; catalog shelves follow. The two halves still load and fail independently. Tests: landing order test and 'provider cards survive a trending failure'.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Explore landing now leads with genre and tag tiles, rotates three genre shelves per day instead of all, adds Recently added and Trending web novels shelves, gives every shelf See all and pointer scroll arrows, has a swipeable, reduced-motion-safe hero with summary and action, and keeps working when any shelf or the whole catalog landing fails.
<!-- SECTION:FINAL_SUMMARY:END -->
