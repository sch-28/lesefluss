---
id: TASK-176.4
title: >-
  Web-novel preview works from a cold link and knows if the series is already in
  the library
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:04'
updated_date: '2026-10-01 10:36'
labels:
  - explore
  - web-novels
  - bug
milestone: m-6
dependencies: []
references:
  - apps/capacitor/src/pages/explore/web-novel-preview.tsx
  - apps/capacitor/src/pages/explore/preview-cache.ts
documentation:
  - EXPLORE-SCOPE.md
modified_files:
  - apps/capacitor/src/services/serial-scrapers/pipeline.ts
  - apps/capacitor/src/services/serial-scrapers/index.ts
  - apps/capacitor/src/pages/explore/use-serial-preview.ts
  - apps/capacitor/src/pages/explore/use-library-membership.ts
  - apps/capacitor/src/pages/explore/web-novel-preview.tsx
  - apps/capacitor/src/pages/explore/__tests__/web-novel-preview.test.tsx
parent_task_id: TASK-176
priority: high
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: `/tabs/explore/web-novel-preview?url=...` only works when the user just tapped a search result, because the page reads the result from an in-memory `previewCache`. A reload, a shared link, or returning after the app was killed shows "Preview unavailable". That also blocks sharing web novels.

Separately, the preview always offers "Add to library" even when the series is already imported, so users can create duplicates.

Outcome: the preview loads from the URL alone and reflects library state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening the preview route with only `?url=` (no cache entry) fetches and shows title, author, cover and description from the provider
- [x] #2 Loading and failure states are shown on cache miss; failure offers retry and a link to the source
- [x] #3 When a series with that source URL is already in the library, the primary action is 'Open in Library' instead of 'Add to library'
- [x] #4 Tests cover cache hit, cache miss success, cache miss failure, and already-imported cases
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. `previewSerial(url)` in serial-scrapers: detect scraper, `fetchSeriesMetadata`, map to `SearchResult`; `NO_SCRAPER` for unknown URLs.
2. `useSerialPreview(url)`: react-query, `initialData` from `previewCache` (cache hit renders instantly, no fetch), otherwise fetches; `retry: false` (rate-limited providers).
3. `useLibrarySeriesByUrl()`: one query over `getSeriesList()` -> Map<normalized sourceUrl, seriesId>, key under `serialKeys.all` so import/delete invalidations refresh it. No capacitor schema/migration change. Shared with 176.7.
4. Preview page: loading via DetailShell, failure via shared ErrorState with Retry + source link; already imported -> primary 'Open in Library' to `/tabs/library/series/$id`.
5. Tests: vitest component tests with mocked scraper registry + queries for cache hit, cache miss success, miss failure (retry), already-imported.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
previewSerial(url) in serial-scrapers/pipeline.ts fetches series metadata only (no chapter list). useSerialPreview seeds react-query with previewCache (cache hit = no fetch); query key sits outside serialKeys.all so imports don't trigger a provider refetch.

In-library check derives a normalized-URL map from the existing useSeriesList query (host lowercased, www. and trailing slash dropped). No capacitor schema or migration change. A provider that serves the same series under two different paths (e.g. slug changed) would still miss.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The web-novel preview loads from ?url= alone: cache hit renders instantly, cold link fetches title/author/cover/description from the provider with loading and a retryable failure state that links to the source. When the series is already in the library, the primary action is Open in Library. Tests cover cache hit, miss success, miss loading/failure+retry and already-imported.
<!-- SECTION:FINAL_SUMMARY:END -->
