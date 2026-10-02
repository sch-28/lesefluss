---
id: TASK-176.1
title: 'Catalog: normalized tags, tag filter and tag listing endpoint'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:04'
updated_date: '2026-10-01 10:36'
labels:
  - explore
  - catalog
milestone: m-6
dependencies: []
references:
  - apps/catalog/src/db/schema.ts
  - apps/catalog/src/sync/gutenberg.ts
  - apps/catalog/src/sync/standard-ebooks.ts
  - apps/catalog/src/routes/search.ts
  - apps/catalog/src/lib/genres.ts
documentation:
  - EXPLORE-SCOPE.md
modified_files:
  - apps/catalog/drizzle/0003_tags_and_browse.sql
  - apps/catalog/src/db/schema.ts
  - apps/catalog/src/db/backfill-cli.ts
  - apps/catalog/package.json
  - apps/catalog/src/index.ts
  - apps/catalog/src/lib/tags.ts
  - apps/catalog/src/lib/sql-array.ts
  - apps/catalog/src/lib/ttl-cache.ts
  - apps/catalog/src/sync/enrich.ts
  - apps/catalog/src/sync/backfill.ts
  - apps/catalog/src/sync/gutenberg.ts
  - apps/catalog/src/sync/standard-ebooks.ts
  - apps/catalog/src/routes/search.ts
  - apps/catalog/src/routes/tags.ts
  - apps/catalog/src/lib/__tests__/tags.test.ts
  - apps/catalog/src/sync/__tests__/gutenberg-map.test.ts
  - apps/catalog/src/routes/__tests__/browse.integration.test.ts
  - agents/catalog.md
parent_task_id: TASK-176
priority: high
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: readers want to browse by kind of book ("short stories", "ghost stories", "satire"). Every `catalog_books` row already has `subjects[]`, but the values are raw and noisy, and the API cannot filter or list by them. Today subjects only feed the 8 hard-coded genre buckets in `lib/genres.ts` via ILIKE.

Sources differ:
- Gutenberg (Gutendex) subjects are Library of Congress headings, e.g. `Short stories, English`, `England -- Social life and customs -- Fiction`, `Detective and mystery stories`.
- Standard Ebooks subjects are OPDS category labels, e.g. `Short Fiction`.

Gutendex also returns `bookshelves` (e.g. `Harvard Classics`, `Gothic Fiction`, `Best Books Ever Listings`) and author `birth_year`/`death_year`, which the sync currently drops (`GutendexBook` type in `sync/gutenberg.ts`). These are free curation and an era signal.

Outcome: the catalog exposes a single, deduplicated tag vocabulary across both sources that clients can filter and browse by, while raw subjects stay available for display.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each catalog book has a normalized tag list with stable, URL-safe ids and display labels, merged across Gutenberg and SE (e.g. Gutenberg `Short stories, English` and SE `Short Fiction` both map to the same short-stories tag)
- [x] #2 LCSH heading noise is reduced: subdivisions after ` -- ` and trailing nationality/era qualifiers do not produce separate tags
- [x] #3 Raw `subjects` remain unchanged and still returned for display
- [x] #4 Gutenberg bookshelves and author birth/death years are persisted at sync
- [x] #5 `/search` accepts one or more tag ids, combinable with q, lang and genre; unknown tag ids return 400
- [x] #6 A tags listing endpoint returns tags with book counts for a given language, sortable by count, with an optional name filter
- [x] #7 Search responses can include the top co-occurring tags with counts for the current result set (for facet chips)
- [x] #8 Existing books are backfilled by re-running sync or a one-off migration; documented in the catalog README or migration notes
- [x] #9 Unit tests cover tag normalization for representative LCSH and SE inputs; route tests cover tag filtering and listing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Migration 0003: `tags text[]` (GIN), `bookshelves text[]`, `author_birth_year int`, `author_death_year int`, `author_keys text[]` (GIN, used by 176.2), `added_at timestamptz` (176.2 recent sort); table `catalog_tags(id PK, label)`.
2. `src/lib/tags.ts`: pure `normalizeSubjects(subjects) -> {id,label}[]`. Split LCSH on ` -- `, keep head; drop `(Fictitious character)` heads; strip trailing `, <Nationality>` / `, <era>` qualifiers and leading nationality adjective before form nouns (English poetry -> Poetry); form subdivisions (Juvenile fiction, Biography, Drama, Poetry, Description and travel, Humor) add a form tag; alias table merges SE + LCSH vocab (Short stories/Shorts/Short Fiction -> short-stories, etc.). Ids = slugified label.
3. Sync: gutenberg + SE mapBook compute tags + labels; gutenberg persists bookshelves + first-author birth/death years; upsert `catalog_tags` labels.
4. Backfill: `src/sync/backfill-tags.ts` recomputes tags (and author keys) from stored rows in batches; runs in background at startup when rows with NULL tags exist; also `pnpm db:backfill` CLI. Documented in agents/catalog.md.
5. `/search?tag=a&tag=b` (also comma form): AND semantics via `tags @> ARRAY[...]`; unknown ids -> 400 (checked against catalog_tags). `facets=tags` adds `facets.tags: [{id,label,count}]` top co-occurring tags excluding selected ones.
6. `GET /tags?lang=&q=&sort=count|name&limit=` with counts (in-memory TTL cache per lang).
7. Tests: unit tests for normalization (vitest, no DB); route integration tests (DB-gated like dict lookup test) for tag filter, 400s, facets, /tags.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Migration 0003_tags_and_browse.sql adds tags/bookshelves/author years/author_keys/added_at + catalog_tags. Normalizer lib/tags.ts (alias table, LCSH head + form subdivisions, nationality/era stripping, character headings dropped, WWI/WWII kept distinct). Bookshelves are persisted but deliberately not fed into tags (they mix curation like 'Best Books Ever Listings' with categories); available for curated shelves later.

Backfill: sync/backfill.ts runs in background on boot when any row has tags IS NULL, plus `pnpm db:backfill`. Ran locally against 18.5k rows in ~4s; 7.8k distinct tags. Docs in agents/catalog.md (Tags and authors section).

Tag filter is AND (narrowing via facets), max 5 tags, repeated or comma form. Facets: `facets=tags`, top 12 co-occurring tags excluding selected.

Tests: lib/__tests__/tags.test.ts, sync/__tests__/gutenberg-map.test.ts, routes/__tests__/browse.integration.test.ts (DB-gated like the dictionary integration test).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Catalog books now carry normalized, URL-safe tags merged across Gutenberg LCSH and SE vocabularies (lib/tags.ts), with labels in catalog_tags. /search filters by one or more tags (unknown -> 400) and can return co-occurring tag facets; GET /tags lists tags with counts per language (sort count|name, name filter). Gutenberg bookshelves and first-author birth/death years are persisted at sync. Existing rows backfill automatically on boot or via `pnpm db:backfill`, documented in agents/catalog.md. Unit + DB-gated route tests added; catalog suite 96/96 against local Postgres.
<!-- SECTION:FINAL_SUMMARY:END -->
