---
id: TASK-37
title: 'Web novel scraping (Royal Road, ScribbleHub)'
status: Done
assignee: []
created_date: '2026-04-27 15:59'
updated_date: '2026-04-28 23:31'
labels: []
milestone: m-4
dependencies: []
documentation:
  - doc-2
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add serial/web-novel scraping support: AO3, ScribbleHub, Royal Road, Wuxiaworld.

Original design lived in doc-1 (Serial scraping — design plan), retired on completion per its disclaimer. doc-2 "Book import architecture — state & roadmap" describes the existing single-book pipeline this builds on top of. Canonical reference is now the in-code header comments under `apps/capacitor/src/services/serial-scrapers/`.

## Status snapshot

**Foundation — landed:**
- Schema migration (capacitor + web + sync)
- Module skeleton + AO3 adapter + `fetchHtml` + search
- Test suite (unit + opt-in live smokes via `pnpm test:live`)
- Library UI (series cards; search relocated to Explore)
- Reader chapter transitions (lazy fetch on `pending` open, auto-advance, ChapterStateOverlay)
- `<DetailShell>` extracted; ExploreBookDetail / LibraryBookDetail refactored; SeriesDetail + SerialPreview added
- Sort by kudos + chapterCount field on SearchResult

**Child tasks — all shipped:**
- TASK-37.1 — Explore unification (web-novel discovery moved under Explore tab; routed page replaces modal)
- TASK-37.2 — ScribbleHub adapter
- TASK-37.3 — Royal Road adapter (CapacitorHttp; window.chapters JSON)
- TASK-37.4 — Wuxiaworld adapter (locked-chapter path); FF.net dropped from scope
- TASK-37.5 — Update-on-open polling for series
- TASK-37.6 — Chapter list inside SeriesDetail
- TASK-37.7 — archived (no project-wide hook/DB testing pattern to extend)
- TASK-37.8 — polishing pass: doc-1 retired, breadcrumbs cleared, surface audited

**Dependencies:**
- TASK-100 (cover image storage optimization — resize/compress) is upstream of all serial adapters that fetch covers; series rows can grow 500KB+ without it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Foundation: schema, adapter interface, AO3, search, test suite all landed
- [x] #2 Four providers implemented: AO3, ScribbleHub, Royal Road, Wuxiaworld (FF.net dropped)
- [x] #3 Discovery unified under Explore tab; no parallel paths
- [x] #4 Update-on-open polling working
- [x] #5 Chapter list visible inside SeriesDetail
- [x] #6 Hook + DB integration tests — archived (TASK-37.7); no project-wide pattern to extend
- [x] #7 Live smoke tests pass for every shipped provider
- [x] #8 doc-1 retired
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What shipped

**Subsystem:** `apps/capacitor/src/services/serial-scrapers/` — full ingestion pipeline for web-novel serials, parallel to `book-import/` but with series-level metadata, lazy chapter fetch, and TOC polling.

**Providers (4):** AO3, ScribbleHub, Royal Road (Cloudflare via CapacitorHttp), Wuxiaworld (locked-chapter path). FF.net dropped (audience overlap with AO3, mid-quality content, no first-party search, hardest-to-scrape Cloudflare wall) — `'ffnet'` provider id reserved in the schema CHECK constraint to avoid a future migration.

**Schema:** new `series` table on capacitor + web (`source_url`, `toc_url`, `provider`, `last_checked_at`, soft-delete), new columns on `books` (`series_id`, `chapter_index`, `chapter_source_url`, `chapter_status`), partial unique index on `(series_id, chapter_index)`. Sync wired through `packages/rsvp-core/src/sync.ts` with CHECK constraints defending the wire.

**Discovery:** web-novel search unified under the Explore tab as a soft-CTA section (`<WebNovelsSection>`) plus a routed search page (`/tabs/explore/web-novels`) with provider filter chips and a routed preview (`/tabs/explore/web-novels/preview`). The original Library `SerialSearchModal` was deleted as part of TASK-37.1.

**Reader integration:** `pending` chapters lazy-fetch on open via `useChapterFetch`, errors render `<ChapterStateOverlay />`, finishing a chapter auto-advances to N+1 (fetching if pending). `pollChapterList` runs on SeriesDetail open and appends new rows.

**Test discipline:** unit tier (pure helpers + adapter parsing against hand-built fixtures + registry fan-out) runs on every `pnpm check-types`; live tier (`pnpm test:live`) hits real upstream once per provider, opt-in only, never in CI. AO3's smoke is self-bootstrapping (search → take first result → exercise meta+TOC) so it doesn't decay against a hard-coded fic URL.

**Architectural guardrails enforced end-to-end:**
- single source of types (`types.ts`) and display strings (`labels.ts`)
- single commit path (`pipeline.ts` → `commit.ts`)
- single ID writer (`commit.ts`)
- single HTTP path (`fetch.ts`: `CapacitorHttp` native, catalog `/proxy/article` web)
- per-provider chained-promise throttle gates both chapter fetches and search calls
- exhaustive narrowing on `ChapterFetchResult` in `commitChapter`
- adapters are pure extractors: no DB, no logging infra, no `fetch`
- public API barrel (`index.ts`) is the only entry point; zero internal-path imports app-wide

**Children:** TASK-37.1 (Explore unification), TASK-37.2 (ScribbleHub), TASK-37.3 (Royal Road), TASK-37.4 (Wuxiaworld + FF.net drop decision), TASK-37.5 (polling), TASK-37.6 (chapter list in SeriesDetail), TASK-37.8 (polishing pass). TASK-37.7 (hook + DB integration tests) archived — no project-wide pattern to extend; adapter parsing is covered by unit fixtures and live smokes.

**Doc handoff:** doc-1 (working notes) retired per its own disclaimer; canonical reference is now the in-code header comments under `services/serial-scrapers/`. doc-2 updated to reflect shipped status.

**Open follow-ups (not blockers):** TASK-100 (cover image resize/compress) remains the right home for fixing 500KB+ base64 covers from any source, including serials.

**Follow-up landed:** chapter rows (books with `series_id` set) were initially syncing full body content/cover/TOC to `sync_books`, which bloated the server DB across users with large serial libraries. Since chapter content is re-derivable via the reader's `chapter-fetch` path on `chapter_status='pending'`, we stopped pushing those heavy fields and added a backfill migration. Lightweight chapter row metadata still syncs (preserving per-chapter position, highlight/glossary `bookId` stability, and series progress). Tracked separately as the TASK-37 follow-up created 2026-04-29.
<!-- SECTION:FINAL_SUMMARY:END -->
