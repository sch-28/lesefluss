---
id: TASK-176.7
title: 'Explore cards: show ''in library'' and allow quick add'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:04'
updated_date: '2026-10-01 10:37'
labels:
  - explore
  - ux
milestone: m-6
dependencies: []
references:
  - apps/capacitor/src/pages/explore/result-card.tsx
  - apps/capacitor/src/pages/explore/web-novel-search-panel.tsx
documentation:
  - EXPLORE-SCOPE.md
modified_files:
  - apps/catalog/src/lib/book-row.ts
  - apps/catalog/src/routes/search.ts
  - apps/catalog/src/routes/landing.ts
  - apps/catalog/src/routes/shelves.ts
  - apps/capacitor/src/services/db/queries/library-membership.ts
  - apps/capacitor/src/services/db/queries/index.ts
  - apps/capacitor/src/services/db/hooks/query-keys.ts
  - apps/capacitor/src/pages/explore/card-badges.tsx
  - apps/capacitor/src/pages/explore/result-card.tsx
  - apps/capacitor/src/pages/explore/catalog-result-card.tsx
  - apps/capacitor/src/pages/explore/use-web-novel-quick-add.ts
  - apps/capacitor/src/pages/explore/web-novel-search-panel.tsx
  - apps/capacitor/src/services/db/__tests__/library-membership.test.ts
  - apps/capacitor/src/pages/explore/__tests__/catalog-views.test.tsx
  - apps/capacitor/src/pages/explore/__tests__/web-novel-cards.test.tsx
parent_task_id: TASK-176
priority: medium
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: catalog and web-novel cards look identical whether or not the book is already imported, so users open books they already own and cannot scan a shelf for new ones. Adding a book always requires opening its detail page first.

Outcome: cards on shelves, search results and web-novel results show library membership at a glance and support adding without a detour.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Catalog and web-novel cards show a visible in-library marker for books already imported
- [x] #2 The marker updates without reload after an import or delete
- [x] #3 A card offers a quick add (e.g. long-press or overflow action) that imports without opening the detail page and confirms success
- [x] #4 Quick add is not offered for books already in the library or without an EPUB
- [x] #5 Library lookups for a grid are batched, not one query per card
- [x] #6 Tests cover marker rendering and quick add
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Catalog API: list rows carry `hasEpub` (`epub_url IS NOT NULL`) so cards know when quick add is possible.
2. `useLibraryCatalogIds()`: one query (`SELECT DISTINCT catalog_id ... WHERE deleted = 0`) keyed under `bookKeys.all`, so imports and deletes refresh the marker without reload. New query file `queries/library-membership.ts` + additive export in `queries/index.ts`. Web novels reuse `useLibrarySeriesByUrl()` from 176.4.
3. Cards (catalog ResultCard + web-novel grid/list items): 'In library' check badge; a '+' quick-add button as a sibling of the card button (no nested buttons, no long-press, so the WebView img-drag freeze cannot trigger). Hidden when in library or `hasEpub === false`. Success toast with 'Open'; failure toast with Retry.
4. Tests: vitest component tests for marker rendering, quick add hidden/visible, quick add calls import and toasts; query test for library-membership against the real SQLite test DB.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Catalog list rows now include hasEpub (absent on older catalog builds; app treats absent as available). Membership: queries/library-membership.ts getLibraryCatalogIds (one query, key bookKeys.catalogIds under bookKeys.all so import/delete invalidations refresh it); web novels reuse the series-URL map from 176.4.

Quick add is a '+' button on the cover corner, rendered as a sibling of the card button (no nested buttons, no long-press, so the WebView img-drag freeze cannot trigger). Hidden until the membership lookup resolves, when in library, or when hasEpub === false. CatalogResultCard is the data container; ResultCard stays presentational.

Only additive edits to image-support-owned queries/index.ts (one import + one entry).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Catalog and web-novel cards (grid and list) show an 'In library' badge that updates in place after import/delete, and offer a one-tap '+' quick add that imports without opening the detail page and confirms with an Open toast (failures toast with Retry). Not offered for owned books or books without an EPUB. Lookups are one query per grid. Tests cover marker rendering and quick add for catalog and web-novel cards plus the membership query against real SQLite.
<!-- SECTION:FINAL_SUMMARY:END -->
