---
id: TASK-37.1
title: 'Explore unification: serial discovery on Explore'
status: Done
assignee: []
created_date: '2026-04-26 15:23'
updated_date: '2026-04-26 17:25'
labels: []
milestone: m-4
dependencies: []
documentation:
  - doc-1
parent_task_id: TASK-37
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Move web-novel discovery into the Explore tab so we have one discovery surface (curated catalog + serials) instead of two parallel paths.

**Why now:** Tapping a search result currently breaks back-navigation (modal closes, back goes to library not search). Fixing that with a routed page is a small change; doing it under Explore solves both the navigation bug AND the "two fronts" architectural smell at once.

**Content bias:** Curated content (Standard Ebooks / Gutenberg) stays the default Explore experience. The web-novel section is a deliberate soft-CTA below the hero — junk-prone content is opt-in, not mixed into the catalog browser.

## Routes

- `/tabs/explore` — existing, gains `<WebNovelsSection>` between hero and genre chips.
- `/tabs/explore/web-novels` — NEW dedicated search page (input + provider filter chips + results).
- `/tabs/explore/web-novels/preview` — MOVED from `/tabs/library/serial-preview`.

## Components

- **`pages/explore/web-novels-section.tsx`** (NEW) — placed between hero and genre chips. Title "Web novels" + horizontal row of branded provider chips with a CSS shimmer animation. Tap section title → `/tabs/explore/web-novels` (no filter); tap a provider chip → same page with `?provider=<id>`. Comment marks the upgrade path: switch to a marquee/carousel once `SCRAPERS.length >= 3`.
- **`pages/explore/web-novels.tsx`** (NEW) — search page. Owns the input (inputmode="search", Enter blurs keyboard), provider filter chips below the input (single-select, syncs with `?provider=`), and the results list. Lifts the search-panel content from the deleted modal.
- **`pages/explore/web-novel-preview.tsx`** (MOVED) — same component as the current `pages/library/serial-preview.tsx`. After import, `replace` to `/tabs/library` (intentional teleport).

## Provider filter — server-side

Extend `searchAll(query, opts?: { provider?: ProviderId })` in `services/serial-scrapers/registry.ts` to filter `SCRAPERS` to the matching provider when set. Saves throttle bandwidth on filtered searches; falls back to all-providers when omitted. `useSearchSerials(query, opts?)` passes through.

## Deletions / wiring changes

- DELETE `pages/library/serial-search-modal.tsx` (its content lifts into `web-novels.tsx`).
- DELETE library route `/tabs/library/serial-preview` (preview moves to explore).
- MOVE `pages/library/serial-search-panel.tsx` → `pages/explore/web-novel-search-panel.tsx`.
- `pages/library/index.tsx` — drop the `searchModalOpen` state, `handlePickSearchResult`, the modal render, and the `SearchResult` import.
- `pages/library/import-sheet.tsx` — drop the `"search"` source entry and `onPickSearch` prop. FAB shrinks to file / clipboard / URL.
- `App.tsx` — register new explore routes, drop old `/tabs/library/serial-preview`, extend `isSubPage` for `/tabs/explore/web-novels` and `/tabs/explore/web-novels/preview`.

## Provider chips visual

Branded chips, one per provider. Brand-color accents:
- AO3: `#990000`
- ScribbleHub: `#1f5f99`
- Royal Road: `#1d4f1d`
- FF.net: `#3a7388`
- Wuxiaworld: `#5e2a82`

CSS-only shimmer gradient sweep loops every ~6s on the chip row. With 1 provider today the row is static + a "More coming soon" muted placeholder; with 3+ the row becomes a horizontal CSS marquee. File comment marks the threshold.

## Out of scope (follow-ups)

- Per-provider search-result counts (e.g. "AO3: 23 / Scribble: 5") — needs result-tagging UX worth its own thought.
- Catalog search hero re-labeling — staying generic; the CTA section makes the split obvious.

## Verification

1. `pnpm check-types` clean.
2. Tap Explore → see hero + new "Web novels" section between hero and genre chips.
3. Tap section title → land on `/tabs/explore/web-novels` (filter "All").
4. Tap a provider chip → same page with that provider preselected.
5. Type query → results stream in (debounced) → tap result → preview → back returns to search with query preserved.
6. From preview, "Add to library" → toast → land on `/tabs/library` → series card appears.
7. Library FAB → no more "Search serials" entry.
8. Pasting an AO3 URL via "Import from URL" still works (existing path, untouched).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 WebNovelsSection renders between hero and genre chips on `/tabs/explore`
- [x] #2 Tapping the section navigates to `/tabs/explore/web-novels`
- [x] #3 Provider filter chip on the search page filters results via `searchAll(q, { provider })`
- [x] #4 Tapping a search result navigates to the preview detail page
- [x] #5 Back from preview returns to search with query preserved
- [x] #6 FAB import sheet no longer has a Search-serials entry
- [x] #7 SerialSearchModal is deleted; search lives only as a routed page
- [x] #8 `pnpm check-types` and `pnpm test` pass
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Web-novel discovery moved into the Explore tab as a soft-CTA section + routed search page, replacing the library-side `SerialSearchModal`. The old broken back-stack from preview → library is fixed because the preview is now pushed onto the explore stack and Ionic Router keeps the search page mounted underneath. `searchAll` gained an `opts.provider` filter wired through `useSearchSerials`.

**Files**
- New: `pages/explore/web-novels-section.tsx`, `web-novels.tsx`, `web-novel-search-panel.tsx`, `web-novel-preview.tsx`, `web-novels-providers.ts` (constants + `isVisibleProvider` guard).
- Modified: `services/serial-scrapers/registry.ts` (provider opt), `services/db/hooks/use-serials.ts`, `services/db/hooks/query-keys.ts`, `pages/explore/landing.tsx`, `App.tsx` (routes + `isSubPage`), `pages/library/index.tsx`, `pages/library/import-sheet.tsx`, `theme/monochrome.css` (chip shimmer + filter-chip classes).
- Deleted: `pages/library/serial-search-modal.tsx`, `serial-search-panel.tsx`, `serial-preview.tsx`.

**Tests:** `pnpm check-types` clean; vitest 63/63 green (includes new `searchAll` provider-filter case in `registry-fanout.test.ts`).
<!-- SECTION:FINAL_SUMMARY:END -->
