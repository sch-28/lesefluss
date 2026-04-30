---
id: TASK-111
title: Show loading state when retrying Webnovel Explore fetches
status: Done
assignee: []
created_date: '2026-04-26 14:29'
updated_date: '2026-04-26 14:31'
labels:
  - bug
  - capacitor
  - explore
dependencies: []
references:
  - apps/capacitor/src/pages/explore/web-novel-search-panel.tsx
  - apps/capacitor/src/services/db/hooks/use-serials.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Retrying failed Webnovel search or popular requests should visibly return the panel to a loading state while the refetch is in flight. Preserve the existing Cloudflare challenge handling so challenge prompts still render and verification-triggered refetches keep working.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pressing Retry after a search failure shows the search loading indicator until the retry resolves.
- [x] #2 Pressing Retry after a popular shelf failure shows the popular loading indicator until the retry resolves.
- [x] #3 Cloudflare challenge prompts and verification-triggered refetch behavior are not removed or bypassed.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Follow-up: avoid blank UI when query data is unavailable outside the normal loading/error states.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Changed the Webnovel Explore panel to render its existing loading indicators whenever TanStack Query reports an in-flight refetch, and also when data is temporarily unavailable instead of rendering a blank panel. Retry buttons for both search and popular now visibly switch to loading, and Cloudflare challenge rendering remains in the completed-fetch branch with verification still calling refetch. Verified the changed file with Biome and the Capacitor app with typecheck plus Vitest.
<!-- SECTION:FINAL_SUMMARY:END -->
