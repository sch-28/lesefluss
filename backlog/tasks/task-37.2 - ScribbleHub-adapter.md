---
id: TASK-37.2
title: ScribbleHub adapter
status: Done
assignee: []
created_date: '2026-04-28 15:24'
updated_date: '2026-04-28 17:24'
labels: []
milestone: m-4
dependencies: []
documentation:
  - doc-1
parent_task_id: TASK-37
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Second `SerialScraper` adapter. Its job is also to verify the foundation — implementing it should require zero changes outside `providers/scribblehub.ts` and the test scaffolding. If something has to change in `types.ts` / `registry.ts` / `pipeline.ts` / shared utils, that's a foundation bug and worth pausing to fix.

## ScribbleHub specifics (from doc-1)

- Host: scribblehub.com
- WordPress SSR, permissive robots.txt, no Cloudflare. The `/proxy/article` web fallback works.
- Throttle: 2s (default).
- Series page: title in `<h1.fic_title>`, author via `span.auth_name_fic` (or similar — confirm against live).
- Chapter list: `ol#ol_toc li a`.
- Chapter content: `div#chp_raw`.
- Search: `/?s=<query>&post_type=fictionposts`.
- No paywall — adapter never returns `{ status: 'locked' }`.
- Chapter count in search results: confirm DOM during impl; the new `chapterCount` field on `SearchResult` is optional.

## Adapter file layout (mirror `providers/ao3.ts` exactly)

1. `PROVIDER_ID`, `THROTTLE_MS` constants at top.
2. `HOST` / `ORIGIN` / `PATHS` (URL builders) — no inline string templates inside method bodies.
3. `SELECTORS` constant — every DOM lookup in one place.
4. Module-private helpers (`absolutize`, `textOrNull`, `parseChapterCount` if needed).
5. Adapter object literal at the bottom — pure composition over the constants/helpers.
6. Add `scribblehubScraper` to `SCRAPERS` in `registry.ts`.
7. Add a label entry for `scribblehub` in `services/serial-scrapers/labels.ts` (TS will fail to compile without it — `Record<ProviderId, string>`).

## Tests

1. Copy `__tests__/providers/ao3.test.ts` → `scribblehub.test.ts`. Replace fixture loader with `__tests__/fixtures/scribblehub/`. Re-implement each test against ScribbleHub's actual selector contract.
2. Hand-build minimal HTML fixtures (one per selector path):
   - `series.html` — work page (title, author, summary).
   - `toc.html` — chapter list.
   - `toc-empty.html` — single-chapter fallback (if applicable).
   - `chapter.html` — chapter content.
   - `chapter-empty.html` — selector-miss path.
   - `search-results.html` — populated results with chapter counts.
   - `search-empty.html` — no matches.
3. Add `__tests__/providers/scribblehub.live.test.ts` — self-bootstrapping smoke (search → fetchSeriesMetadata → fetchChapterList against the first hit).
4. Confirm `searchAll` partial-failure semantics still hold across the new provider — should not require any test change in `registry-fanout.test.ts`.

## Verification

1. `pnpm check-types` clean (unit suite includes the new tests).
2. `pnpm test:live` clean (smokes for both AO3 and ScribbleHub run successfully).
3. Manual: paste a ScribbleHub work URL → series imports with all chapters pending → open chapter → content loads.
4. Manual: search a term known on ScribbleHub → results appear with provider chip "ScribbleHub" → tap → preview → import.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `providers/scribblehub.ts` implements `SerialScraper` (id, canHandle, fetchSeriesMetadata, fetchChapterList, fetchChapterContent, search)
- [x] #2 `scribblehubScraper` registered in `services/serial-scrapers/registry.ts`
- [x] #3 Label entry `scribblehub` present in `labels.ts` so TS compiles
- [x] #4 Hand-built fixtures + unit tests under `__tests__/providers/` and `__tests__/fixtures/scribblehub/`
- [x] #5 Live-test smoke `scribblehub.live.test.ts` passes
- [x] #6 No changes outside `providers/scribblehub.ts`, `labels.ts`, `registry.ts`, and the new test/fixture files (foundation contract holds)
- [x] #7 `pnpm check-types` + `pnpm test:live` clean
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Final approach

Mirror `providers/ao3.ts` exactly — same file layout (PROVIDER_ID/THROTTLE_MS → HOST/ORIGIN/PATHS → SELECTORS → helpers → adapter at bottom). Doc-1 guardrails honored: every DOM lookup in one `SELECTORS` const, no inline string templates in method bodies, helpers module-private.

### Key decisions

- **Throttle: 2_000ms** (SH default; only AO3 + FF.net warrant 5s).
- **`canHandle` accepts both URL shapes:** `/series/{id}/{slug}/` AND `/read/{id}-{slug}/chapter/{n}/`. `seriesRootFromUrl` derives the series root by URL pattern alone (split chapter-segment on first `-` to recover id+slug) — no extra fetch.
- **`tocUrl === sourceUrl`** — SH renders the chapter list inline on the series page; no separate `/navigate` endpoint.
- **Empty-TOC fallback:** synthesize one ref pointing at the series root (mirrors AO3's `navigate-empty` pattern).
- **`fetchChapterContent` returns only `'fetched' | 'error'`** — never `'locked'` (SH has no paywall).
- **Live SELECTORS verified via curl** — TOC selector is `ol.toc_ol li a.toc_a` (not doc-1's `ol#ol_toc li a`); search-result author is `span.a_un_st a` (not doc-1's `span.s_a`). Adapter uses live markup.
- **Search description extraction:** clone `div.search_body`, strip `search_title`/`search_stats`/`search_genre`/`dots`/`morelink`/`testhide`, read remaining text. Hidden expanded tail (`testhide`) stays out — keeps result blurbs short.
- **Chapter count parsing:** SH renders e.g. "7 Chapters" or "1.6k Chapters". Only commit to a number when prefix is a clean integer; abbreviated counts return `null` (UI shows "unknown" rather than misleading "1").
- **Cover placeholder handling:** `mid_noimagefound.jpg` returns `null` so the UI renders its own fallback consistently across providers.

### Foundation contract held

No foundation file edits. The only file touched outside `providers/scribblehub.ts` and the new test/fixture files:
- `registry.ts` — one-line import + array push to register the scraper.
- `__tests__/registry-fanout.test.ts` — added a `vi.mock('../providers/scribblehub')` factory that returns `[]` from `search`, parallel to the existing AO3 mock. This keeps the fan-out tests self-contained now that two real adapters are registered. Test-only change, not a foundation change.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary

Adds the ScribbleHub adapter as the second `SerialScraper` provider, validating the foundation contract from TASK-37.

### Changes

- **New** `apps/capacitor/src/services/serial-scrapers/providers/scribblehub.ts` — adapter mirroring `providers/ao3.ts` layout exactly.
- **New** `__tests__/providers/scribblehub.test.ts` — 17 unit tests covering `canHandle`, `fetchSeriesMetadata`, `fetchChapterList`, `fetchChapterContent`, and `search` against hand-built fixtures.
- **New** `__tests__/providers/scribblehub.live.test.ts` — self-bootstrapping live smoke (search → metadata → chapter list) using query `"reincarnation"`.
- **New** 6 minimal fixtures under `__tests__/fixtures/scribblehub/`: `series.html`, `series-empty-toc.html`, `chapter.html`, `chapter-empty.html`, `search-results.html`, `search-empty.html`.
- **Edit** `registry.ts` — one-line import + push to register `scribblehubScraper`.
- **Edit** `__tests__/registry-fanout.test.ts` — added a parallel `vi.mock` for the SH provider factory so existing fan-out tests stay self-contained now that two adapters are registered.

### Provider behaviors

- Accepts both `/series/{id}/{slug}/` and `/read/{id}-{slug}/chapter/{n}/` URLs; chapter URLs derive their series root by URL pattern (no extra fetch).
- `tocUrl === sourceUrl` because SH renders the chapter list inline on the series page.
- 2s throttle (SH default).
- `fetchChapterContent` returns only `'fetched' | 'error'` — SH has no paywall.
- Search results parse chapter count only for clean integer prefixes; abbreviated forms ("1.6k") yield `null`. Cover placeholder `mid_noimagefound.jpg` yields `null`.

### Verification

- `pnpm check-types` — clean (typecheck + 63/63 unit tests pass).
- `pnpm test:live` — clean (live smoke for both AO3 and SH passes against production sites).

### Foundation contract held

Zero changes to `types.ts`, `labels.ts` (already had `scribblehub`), `pipeline.ts`, or shared utils. Adapter slots into the foundation purely via the registry.

### Risks / follow-ups

- SH abbreviated-count parsing: `"1.6k Chapters"` → `null`. If product wants approximate display, parse and round in a follow-up.
- Live smoke uses query `"reincarnation"` — if SH ever returns zero hits for that, swap to another evergreen isekai term.
- `stripHidden` is run defensively even though SH doesn't ship hidden anti-piracy paragraphs today; matches the documented "cheap and keeps adapters symmetric" pattern from the AO3 adapter.
<!-- SECTION:FINAL_SUMMARY:END -->
