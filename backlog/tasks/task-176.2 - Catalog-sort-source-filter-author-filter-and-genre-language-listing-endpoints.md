---
id: TASK-176.2
title: >-
  Catalog: sort, source filter, author filter, and genre/language listing
  endpoints
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:04'
updated_date: '2026-10-02 16:58'
labels:
  - explore
  - catalog
dependencies: []
references:
  - apps/catalog/src/routes/search.ts
  - apps/catalog/src/lib/genres.ts
  - apps/capacitor/src/pages/explore/index.tsx
documentation:
  - EXPLORE-SCOPE.md
modified_files:
  - apps/catalog/src/lib/authors.ts
  - apps/catalog/src/lib/search-params.ts
  - apps/catalog/src/lib/genres.ts
  - apps/catalog/src/routes/search.ts
  - apps/catalog/src/routes/genres.ts
  - apps/catalog/src/routes/languages.ts
  - apps/catalog/src/routes/landing.ts
  - apps/catalog/src/index.ts
  - apps/catalog/src/lib/__tests__/authors.test.ts
  - apps/catalog/src/routes/__tests__/browse.integration.test.ts
  - apps/capacitor/src/services/catalog/client.ts
  - apps/capacitor/src/services/catalog/query-keys.ts
  - apps/capacitor/src/pages/explore/index.tsx
  - agents/catalog.md
parent_task_id: TASK-176
priority: high
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: the Explore UI needs real browse controls, and today the API cannot support them.

Current limits:
- `/search` order is only `relevance` or `popular`, and the app derives it implicitly (popular when browsing a genre without a query).
- No way to restrict to Standard Ebooks vs Gutenberg; SE is the high-quality typographic tier some readers want exclusively.
- No author-scoped search; tapping an author name in the app has nothing to call.
- The 8 genres live in `apps/catalog/src/lib/genres.ts` AND are duplicated as a label map (`GENRE_LABELS`) in `apps/capacitor/src/pages/explore/index.tsx`, kept in sync by hand. The genre set is too small (no Romance, Adventure, Horror/Gothic, Fantasy, Short stories, Essays, Biography, Humor).
- The app hard-codes 5 languages + "All" with no counts.

Outcome: the API offers explicit sort, source and author filters, plus endpoints that tell the client which genres and languages exist and how many books each has, so the client holds no copies.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `/search` accepts an explicit sort: relevance, popular, title, author, recently added; invalid values return 400
- [x] #2 `/search` accepts a source filter (standard_ebooks, gutenberg, any)
- [x] #3 `/search` accepts an author filter that matches books by that author exactly enough to power a 'more by this author' list
- [x] #4 Genre set is extended with at least Romance, Adventure, Horror/Gothic, Fantasy, Short stories, Essays, Biography, Humor
- [x] #5 A genres endpoint returns id, label and book count for a language
- [x] #6 A languages endpoint returns language codes with book counts
- [x] #7 Route tests cover each new parameter and endpoint, including empty and invalid inputs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. `/search?sort=relevance|popular|title|author|recent`; invalid -> 400. Legacy `order=popular|relevance` still accepted (shipped app versions send it). Default: relevance with q, popular without.
2. `source=standard_ebooks|gutenberg|any` (also `se` shorthand); invalid -> 400.
3. `author=<name>`: matches `author_keys && keys(name)`. `authorKey()` normalizes "Last, First Middle" and "First Middle Last" to "first last" (diacritics/punct stripped), so Gutenberg "Shelley, Mary Wollstonecraft" and SE "Mary Shelley" match. Keys persisted at sync from structured author arrays, backfilled heuristically from stored text (shared with 176.1 backfill). `q` optional when author/tag/genre given.
4. Genres: add romance, adventure, horror (horror/gothic/ghost), fantasy, short-stories, essays, biography (biograph/memoir), humor (humor/humorous/wit/satire). `onLanding` flag keeps landing to the original 8 shelves until 176.8.
5. `GET /genres?lang=` -> [{id,label,count}], `GET /languages` -> [{code,count}] grouped by primary subtag; both TTL-cached.
6. Client: delete GENRE_LABELS in explore/index.tsx, labels come from `/genres` (query hook), fallback to raw id while loading.
7. Route integration tests (DB-gated) for each param/endpoint incl. empty + invalid; unit tests for authorKey.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
sort=relevance|popular|title|author|recent (400 on invalid); legacy order= still accepted and echoed for shipped app builds. source=standard_ebooks|se|gutenberg|any. author= matches author_keys (lib/authors.ts: first given + last surname, so 'Shelley, Mary Wollstonecraft' == 'Mary Shelley'). Any of q/genre/tag/author/non-any source is enough to search.

Known limits: sort=author orders by the raw author string, which mixes 'Last, First' (Gutenberg) and 'First Last' (SE). Backfilled author keys for multi-author Gutenberg rows come from a heuristic split of the joined string until the next full sync.

Genres extended to 16 (romance, adventure, horror & gothic, fantasy, short stories, essays, biography & memoir, humor). Genre has an onLanding flag so /landing keeps its original 8 shelves until TASK-176.8.

GET /genres?lang= and GET /languages (primary subtag) are TTL-cached 10 min. App: GENRE_LABELS removed from explore/index.tsx, active-chip label comes from /genres; app now sends sort= instead of order=.

Deploy order: catalog before the app, otherwise genre browsing on the new app falls back to relevance and the chip shows the raw genre id.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
/search gains explicit sort (relevance/popular/title/author/recent), source and author filters with 400s on invalid values; legacy order= keeps working. Genre set extended from 8 to 16. New GET /genres (id, label, count per language) and GET /languages (code, count). The app reads genre labels from /genres; GENRE_LABELS is gone. Route tests cover each param and endpoint including empty and invalid input.
<!-- SECTION:FINAL_SUMMARY:END -->
