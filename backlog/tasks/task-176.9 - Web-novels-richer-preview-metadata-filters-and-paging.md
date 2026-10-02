---
id: TASK-176.9
title: 'Web novels: richer preview metadata, filters and paging'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:04'
updated_date: '2026-10-01 11:52'
labels:
  - explore
  - web-novels
milestone: m-11
dependencies: []
references:
  - apps/capacitor/src/pages/explore/web-novels.tsx
  - apps/capacitor/src/pages/explore/web-novel-search-panel.tsx
  - apps/capacitor/src/pages/explore/web-novel-preview.tsx
  - apps/capacitor/src/services/serial-scrapers
documentation:
  - EXPLORE-SCOPE.md
modified_files:
  - apps/capacitor/src/services/serial-scrapers/types.ts
  - apps/capacitor/src/services/serial-scrapers/registry.ts
  - apps/capacitor/src/services/serial-scrapers/index.ts
  - apps/capacitor/src/services/serial-scrapers/pipeline.ts
  - apps/capacitor/src/services/serial-scrapers/providers/royalroad.ts
  - apps/capacitor/src/services/serial-scrapers/providers/ao3.ts
  - >-
    apps/capacitor/src/services/serial-scrapers/__tests__/providers/details.test.ts
  - >-
    apps/capacitor/src/services/serial-scrapers/__tests__/providers/royalroad.test.ts
  - apps/capacitor/src/services/serial-scrapers/__tests__/providers/ao3.test.ts
  - >-
    apps/capacitor/src/services/serial-scrapers/__tests__/fixtures/royalroad/fiction-details.html
  - >-
    apps/capacitor/src/services/serial-scrapers/__tests__/fixtures/ao3/work-details.html
  - apps/capacitor/src/services/db/hooks/use-serials.ts
  - apps/capacitor/src/services/db/hooks/query-keys.ts
  - apps/capacitor/src/services/db/hooks/index.ts
  - apps/capacitor/src/pages/explore/web-novels.tsx
  - apps/capacitor/src/pages/explore/web-novel-search-panel.tsx
  - apps/capacitor/src/pages/explore/web-novel-preview.tsx
  - apps/capacitor/src/pages/explore/web-novel-facts.tsx
  - apps/capacitor/src/pages/explore/use-serial-preview.ts
  - apps/capacitor/src/routes/tabs/explore/web-novels.tsx
  - apps/capacitor/src/pages/explore/__tests__/web-novel-preview.test.tsx
  - apps/capacitor/src/pages/explore/__tests__/web-novel-paging.test.tsx
parent_task_id: TASK-176
priority: medium
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: for web fiction, tags, status and length decide whether someone starts a series, yet the preview shows only title, author, cover, chapter count and description. AO3 readers rely on rating, warnings, fandoms and relationships. The web-novel search page filters only by provider, returns a single batch with no "load more", and the popular list has no time window or genre.

Outcome: web-novel discovery exposes the metadata and filters each provider supports.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Preview shows, where the provider supplies it: tags/genres, status (ongoing/complete), last updated, word count, rating/followers
- [x] #2 AO3 preview shows rating, archive warnings, fandoms and relationships
- [x] #3 Search results can load more pages for providers that support paging
- [x] #4 Popular list supports a time window and/or genre where the provider supports it
- [ ] #5 Search page offers filters for status and genre/tag where supported; unsupported filters are hidden per provider, not shown disabled
- [x] #6 Scraper tests cover the new parsed fields for each provider touched
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Ship the cheap providers (Royal Road, AO3) and list the rest as follow-ups, per the coordinator's instruction. Types: SeriesDetails (tags, status, lastUpdated, wordCount, rating, ratingCount, followers, kudos, ao3 {rating, warnings, fandoms, relationships}) on SeriesMetadata/SearchResult; SearchOptions {page, status}; PopularOptions {window}; per-provider capabilities {searchPaging, statusFilter, popularWindows} drive which controls the UI shows.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Royal Road: parseFictionDetails reads tags (span.tags a.fiction-tag), status label, JSON-LD aggregateRating + dateModified, Followers from the stats list (selectors checked against a live fiction page). Search paging (&page=) and status (&status=COMPLETED|ONGOING); popular windows week/trending/all-time -> weekly-popular / trending / best-rated.

AO3: parseWorkDetails reads dl.work.meta (rating, warnings, fandoms, relationships, freeform tags) and dl.stats (words, kudos, chapters n/n -> completed, Updated or Published date); checked against a live public work. Search paging (&page=) and completion filter (work_search[complete]=T|F). No popular windows (AO3 has no listing for it).

Registry/hooks: searchAll/popularAll take options; providerCapabilities(id); new useSearchSerialPages (infinite, single provider) and usePopularSerials(provider, window). Web-novels page: status chips when the selected provider supports it, popular-window chips when it has windows, Load more for paging providers; status and window live in the URL; switching provider drops them. Unsupported filters are not rendered.

Preview: on a search-tap cache hit the page renders at once and still fetches the series page for details; a failed details fetch keeps the cached entry. Shows status, words, rating, followers, kudos, last updated, tags, and an AO3 block (rating, warnings, fandoms, relationships).

Follow-ups (not done): ScribbleHub details/paging/filters (its pages are Cloudflare-challenged from a plain client here, so markup could not be verified); Wuxiaworld details (API-based, separate shape); genre/tag filter for RR (tagsAdd=) and AO3 fandom filter; AO3 popular time window via revised_at ranges.

Tests: providers/details.test.ts (both parsers on new fixtures incl. empty pages, n/n completion and published fallback, paging/status URLs, popular window mapping, capabilities), updated royalroad/ao3 metadata expectations, web-novel-preview tests (cache hit + background details, failure keeps cache, facts/tags, AO3 block), web-novel-paging.test.tsx (paging + status passthrough, unsupported filters dropped, window only where supported).

AC5 left unchecked on purpose: status filters ship for RR and AO3 and unsupported filters are hidden, but no genre/tag filter exists yet (follow-up above).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Web-novel previews now show tags, status, last updated, word count, rating, followers or kudos where Royal Road and AO3 supply them, and AO3 previews show rating, warnings, fandoms and relationships. Royal Road and AO3 searches load more pages and filter by status, and Royal Road's popular list has week/trending/all-time windows; controls appear only for providers that support them. ScribbleHub and Wuxiaworld are listed as follow-ups.
<!-- SECTION:FINAL_SUMMARY:END -->
