---
id: TASK-176.14
title: Unified Explore search across catalog and web novels
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:05'
updated_date: '2026-10-02 16:58'
labels:
  - explore
  - ux
dependencies: []
references:
  - apps/capacitor/src/pages/explore/index.tsx
  - apps/capacitor/src/pages/explore/web-novels.tsx
  - apps/capacitor/src/pages/explore/web-novel-search-panel.tsx
documentation:
  - EXPLORE-SCOPE.md
modified_files:
  - apps/catalog/src/routes/search.ts
  - apps/capacitor/src/pages/explore/index.tsx
  - apps/capacitor/src/pages/explore/search-field.tsx
  - apps/capacitor/src/pages/explore/recent-searches.ts
  - apps/capacitor/src/pages/explore/grouped-results.tsx
  - apps/capacitor/src/pages/explore/web-novels.tsx
  - apps/capacitor/src/pages/explore/web-novel-search-panel.tsx
  - apps/capacitor/src/routes/tabs/explore/web-novels.tsx
  - apps/capacitor/src/pages/explore/__tests__/grouped-results.test.tsx
  - apps/capacitor/src/pages/explore/__tests__/recent-searches.test.ts
  - apps/capacitor/e2e/explore-browse.spec.ts
parent_task_id: TASK-176
priority: high
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: Explore has two unrelated searches. The header search on `/tabs/explore` only queries the public-domain catalog; web novels are only searchable on `/tabs/explore/web-novels`. Typing a web-novel title ("Cradle") into Explore returns "No results" with no hint where to look. The header search is also hidden behind an icon and collapses on blur when empty, and the query is component state, not in the URL. Empty focus shows nothing; "No results" offers no next step.

Outcome: one search entry point that finds books from every source Explore knows about.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Explore landing has a persistent, visible search field (not only a header icon)
- [x] #2 One query returns results grouped by source: public-domain catalog and each web-novel provider, each group with 'see all'
- [x] #3 Slow or failing providers do not block catalog results; per-provider failures are shown inline
- [x] #4 Query is stored in the URL and restored on back navigation and reload
- [x] #5 Focusing an empty search shows recent searches (stored locally, clearable)
- [x] #6 Zero results offer next steps: clear filters, switch language to all, spelling suggestion where available
- [x] #7 Tests cover grouped results, partial provider failure, URL restore and recent searches
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Persistent search field at the top of Explore (header icon removed). Typing debounces into `?q=` (replace), so back/reload restore it.
2. With `q` and no catalog-only filters: grouped view. "Public domain" group (catalog top results, See all -> `scope=catalog` full results) plus one group per web-novel provider from the existing fan-out (See all -> /tabs/explore/web-novels?provider=&q=). Catalog and providers are independent queries, so slow providers never block catalog; failed providers show inline with Retry, Cloudflare challenges reuse CloudflareChallenge.
3. Web-novels page reads/writes `q` in its URL so See all lands with the query.
4. Recent searches: localStorage (max 8, deduped, clearable), recorded on Enter and when a result is opened; shown when the field is focused and empty.
5. Zero results: catalog API returns a trigram `suggestion` (index-backed, only on empty results); UI offers "Search for <suggestion>", "Clear filters" when filters are set, "Search all languages" when lang != all.
6. Tests: grouped results, partial provider failure, URL restore, recent searches (storage + UI).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Persistent SearchField replaces the header search icon. Typing debounces into ?q= (replace); URL changes (back, recents, suggestion) refill the box.

Grouped view (q without catalog-only filters): catalog shelf 'Public domain (N)' with See all -> scope=catalog, plus one section per provider from the existing fan-out with See all -> /tabs/explore/web-novels?provider=&q= (that page now reads/writes q in its URL). Catalog and providers are separate queries; failed providers show an inline 'X didn't respond' with Retry, Cloudflare challenges reuse CloudflareChallenge.

Recent searches: localStorage, max 8, case-insensitive dedupe, recorded on Enter, recent pick and when a result is opened; shown on focus with an empty field; per-item remove and Clear.

Zero results: catalog returns `suggestion` (index-backed trigram, threshold 0.2 via set_config in a transaction, only when total is 0); UI offers Search for suggestion / Clear filters / Search all languages, each only when applicable.

Tests: grouped-results.test.tsx (groups, catalog not blocked by loading providers, partial failure, zero results), recent-searches.test.ts, catalog integration test for suggestion, e2e query URL restore across detail round trip + recents.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Explore has one always-visible search that queries the catalog and every web-novel provider, grouped by source with See all per group. Slow or failing providers never block catalog results and are reported inline. The query lives in the URL; recent searches show on focus; zero results offer a spelling suggestion, clearing filters or all languages.
<!-- SECTION:FINAL_SUMMARY:END -->
