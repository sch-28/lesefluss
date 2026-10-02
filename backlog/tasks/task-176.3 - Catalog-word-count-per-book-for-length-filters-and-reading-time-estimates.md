---
id: TASK-176.3
title: 'Catalog: word count per book for length filters and reading-time estimates'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:04'
updated_date: '2026-10-01 11:35'
labels:
  - explore
  - catalog
milestone: m-6
dependencies: []
references:
  - apps/catalog/src/db/schema.ts
  - apps/catalog/src/sync/orchestrator.ts
  - TASK-67
documentation:
  - EXPLORE-SCOPE.md
modified_files:
  - apps/catalog/drizzle/0004_word_count.sql
  - apps/catalog/src/db/schema.ts
  - apps/catalog/src/lib/word-count.ts
  - apps/catalog/src/sync/word-count-crawler.ts
  - apps/catalog/src/sync/word-count-store.ts
  - apps/catalog/src/sync/proxy-word-count.ts
  - apps/catalog/src/routes/books.ts
  - apps/catalog/src/routes/search.ts
  - apps/catalog/src/lib/search-params.ts
  - apps/catalog/src/lib/book-row.ts
  - apps/catalog/src/index.ts
  - apps/catalog/.env.example
  - apps/catalog/package.json
  - pnpm-lock.yaml
  - apps/catalog/src/lib/__tests__/word-count.test.ts
  - apps/catalog/src/sync/__tests__/word-count-crawler.test.ts
  - apps/catalog/src/routes/__tests__/epub-proxy.integration.test.ts
  - apps/catalog/src/routes/__tests__/browse.integration.test.ts
  - apps/capacitor/src/pages/explore/length.ts
  - apps/capacitor/src/pages/explore/use-reader-wpm.ts
  - apps/capacitor/src/pages/explore/filter-row.tsx
  - apps/capacitor/src/pages/explore/result-card.tsx
  - apps/capacitor/src/pages/explore/catalog-list-item.tsx
  - apps/capacitor/src/pages/explore/book-detail.tsx
  - agents/catalog.md
parent_task_id: TASK-176
priority: medium
ordinal: 98000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: length is the most useful filter for an RSVP reading app ("under one hour at my WPM"), and reading time is a fact readers want on cards and detail pages. `catalog_books` stores no length today, so neither the short-reads filter (TASK-67) nor reading-time estimates are possible.

Outcome: each catalog book has a word count the API returns and can filter/sort by. The count should be close to what the app's own tokenizer (`@lesefluss/core`) would produce after import, so estimates match what the reader later sees.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Catalog books with an EPUB have a word count; books without one report null and are excluded from length filters, not treated as zero
- [x] #2 Word count is computed with a tokenizer consistent with the app's (difference documented if not identical)
- [x] #3 `/search` accepts min/max word count filters and a length sort
- [x] #4 Search and book responses include the word count
- [x] #5 Computation is incremental: unchanged books are not re-downloaded on every sync
- [x] #6 Tests cover count extraction on a sample EPUB and the new filters
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Approved approach C (crawler + proxy counting), jszip approved.
1. Migration 0004: word_count int, word_count_epub_url text (which epub_url was counted, so a changed URL recounts), word_count_failed_at timestamptz; partial index for pending rows.
2. lib/word-count.ts: jszip + OPF spine walk, XHTML text extraction, counter ported from @lesefluss/core's tokenizer rules (core ships TS source and the catalog runs compiled JS, so it can't import it at runtime). A test pins parity with core's buildWordIndex on fixture text; known drift documented.
3. Crawler (sync/word-count-crawler.ts): env WORD_COUNT_CRAWL=on|off (default off), WORD_COUNT_CRAWL_INTERVAL_MS (min 3000), GUTENBERG_MIRROR (default https://gutenberg.pglaf.org). Never runs under NODE_ENV=test, VITEST or CI. Sequential, one request per interval, descriptive User-Agent with contact URL, exponential backoff on 429/5xx, other failures marked and retried after 7 days. Gutenberg only via mirror path cache/epub/{id}/pg{id}-images.epub, never www.gutenberg.org. SE via feed URL with patron auth. Resumable: all state in DB.
4. Proxy counting: tee the upstream body in /books/epub; the client branch streams untouched, the other is collected (size-capped) and counted in the background after the stream; never blocks the response.
5. API: wordCount on list rows and detail; /search min_words / max_words (null rows excluded when set) and sort=length.
6. App: length chip in the filter row (buckets by reading time at the user's WPM, `length` in URL) and reading-time facts on grid cards and list rows.
7. Tests: extraction + count on a built fixture EPUB, parity with core, crawler selection/backoff logic (pure parts), proxy tee not altering bytes, route filters/sort.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Migration 0004_word_count.sql: word_count, word_count_epub_url, word_count_failed_at + indexes. lib/word-count.ts (jszip + OPF spine, nav skipped) with countWords reimplementing core's tokenizer rules; parity test against packages/core/src/tokenizer.ts on 8 mixed samples (dashes, ellipses, hyphens, Latin Extended, CJK/Cyrillic, soft hyphen/zero-width). Sanity check: Frankenstein from the pglaf mirror counts 78,327 (about 75k text plus Gutenberg licence).

Crawler: WORD_COUNT_CRAWL=on|off (default off, .env.example documents it), WORD_COUNT_CRAWL_INTERVAL_MS (floor 3000), GUTENBERG_MIRROR (default https://gutenberg.pglaf.org). Never enabled under NODE_ENV=test, VITEST or CI (tested). Gutenberg URL rewritten to the mirror's cache/epub path, never www.gutenberg.org (tested). Backoff on 429/5xx/network, failures retried after 7 days, state in DB so restarts resume.

Proxy: /books/epub tees the upstream body only when the row lacks a count for its current EPUB; the client branch is returned untouched, counting runs after in the background and swallows its own errors (integration test asserts byte-identical body, background count, no recount, failure-safe).

API: wordCount on list rows and /books/:id; /search min_words/max_words (uncounted excluded), sort=length (uncounted last), 400 on malformed or inverted bounds.

App: length chip (Under 1 hour / 1-3 h / 3-10 h / Over 10 h at the reader's RSVP wpm, `length` in URL), 'Shortest first' sort, reading time on grid cards, list rows and the catalog detail facts.

pnpm-lock.yaml: only the three jszip lines for apps/catalog were added (diffed against a snapshot).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Catalog books get word counts from two sources: a polite, resumable background crawler (off by default, Gutenberg via official mirror only, 3 s floor, backoff) and opportunistic counting of EPUBs the proxy already streams, without touching or delaying the response. Counts follow the app tokenizer's rules (parity-tested against @lesefluss/core). /search filters by min/max words and sorts by length; responses carry wordCount. The app shows reading time at the reader's speed on cards, list rows and detail, and has a length chip in the filter row.
<!-- SECTION:FINAL_SUMMARY:END -->
