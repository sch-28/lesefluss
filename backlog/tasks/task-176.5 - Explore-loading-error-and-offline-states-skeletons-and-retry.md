---
id: TASK-176.5
title: 'Explore loading, error and offline states: skeletons and retry'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:04'
updated_date: '2026-10-02 16:58'
labels:
  - explore
  - ux
dependencies: []
references:
  - apps/capacitor/src/pages/explore/landing.tsx
  - apps/capacitor/src/pages/explore/search-results.tsx
  - apps/capacitor/src/pages/explore/web-novel-search-panel.tsx
documentation:
  - EXPLORE-SCOPE.md
modified_files:
  - apps/capacitor/src/pages/_shared/load-states.tsx
  - apps/capacitor/src/pages/_shared/detail-shell.tsx
  - apps/capacitor/src/pages/explore/states.tsx
  - apps/capacitor/src/pages/explore/landing.tsx
  - apps/capacitor/src/pages/explore/search-results.tsx
  - apps/capacitor/src/pages/explore/shelf.tsx
  - apps/capacitor/src/pages/explore/web-novel-search-panel.tsx
  - apps/capacitor/src/test/render.tsx
  - apps/capacitor/vite.config.ts
  - apps/capacitor/src/pages/_shared/__tests__/load-states.test.tsx
  - apps/capacitor/src/pages/explore/__tests__/catalog-views.test.tsx
parent_task_id: TASK-176
priority: medium
ordinal: 100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: catalog landing and results show a full-page spinner while loading and a bare error message on failure with no way to retry (the web-novel panel already has an ErrorState with Retry). Errors surface raw `error.message`; there is no explicit offline state. Layout jumps when content arrives.

Outcome: Explore feels stable while loading and recoverable when the network fails, consistently across catalog and web-novel views.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Landing shelves and result grids show skeleton cards in the final layout while loading instead of a full-page spinner
- [x] #2 Every catalog error state offers a Retry action that refetches
- [x] #3 When the device is offline, Explore shows a clear offline message instead of a raw fetch error
- [x] #4 Catalog and web-novel views share the same loading/error/empty components
- [x] #5 Component tests cover loading, error-with-retry and offline rendering
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. `pages/explore/states.tsx`: shared `CardGridSkeleton` (grid/list), `ShelfSkeleton`, `ErrorState` (Retry + optional source link), `EmptyState`. `ErrorState` takes the error and shows an offline message when `navigator.onLine` is false or the fetch failed at network level; never raw `error.message`. Pure `describeLoadError()` + `useIsOnline()` (online/offline events).
2. Landing: hero + shelf skeletons in final layout; error -> ErrorState with refetch. Results: grid skeleton; error -> ErrorState with refetch.
3. Web-novel panel: drop its private Loading/Error/Empty components, use the shared ones (grid or list skeleton by view mode).
4. DetailShell: error state uses ErrorState so detail pages get Retry too (needed by 176.4).
5. Tests: enable `*.test.tsx` in vitest config, render with react-dom/client + act (no new deps). Cover loading skeleton, error-with-retry (click refetches), offline rendering, describeLoadError.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Shared ErrorState/EmptyState/useIsOnline/describeLoadError live in pages/_shared/load-states.tsx (DetailShell uses them too, via new error/onRetry/errorSourceLink props). Skeletons (CardGridSkeleton grid|list, ShelfSkeleton, ShelfStripSkeleton, HeroSkeleton) in pages/explore/states.tsx. Raw error.message is never shown; copy is offline / couldn't connect / something went wrong.

Random shelf on landing now shows skeleton + retryable error too.

Test infra: vitest include now covers *.test.tsx; src/test/render.tsx is a small react-dom/client + act helper (no new dependency).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Explore landing, results, shelves and web-novel panel show skeletons in the final layout instead of spinners; every catalog error offers Retry; offline shows a clear offline message instead of fetch errors. Catalog and web-novel views share the same loading/error/empty components. Component tests cover loading, error-with-retry and offline.
<!-- SECTION:FINAL_SUMMARY:END -->
