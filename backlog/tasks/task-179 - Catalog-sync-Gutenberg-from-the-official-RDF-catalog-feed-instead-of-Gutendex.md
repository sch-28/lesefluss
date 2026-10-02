---
id: TASK-179
title: 'Catalog: sync Gutenberg from the official RDF catalog feed instead of Gutendex'
status: Done
assignee: []
created_date: '2026-10-01 23:51'
updated_date: '2026-10-02 00:29'
labels:
  - catalog
  - bug
milestone: m-10
dependencies: []
references:
  - apps/catalog/src/sync/gutenberg.ts
  - apps/catalog/src/sync/orchestrator.ts
  - 'https://www.gutenberg.org/ebooks/offline_catalogs.html'
  - 'https://www.gutenberg.org/cache/epub/feeds/rdf-files.tar.bz2'
  - TASK-176
priority: high
ordinal: 123000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: the production catalog's weekly Gutenberg sync always fails with `Gutendex page 1 → HTTP 403` after 3 retries. From a residential connection gutendex.com returns 200 regardless of User-Agent, so the server's IP is most likely blocked or challenged by Cloudflare. The same server also gets 403 from ScribbleHub and character.ai. The current sync crawls ~2.5k Gutendex pages per run at 1 req/s with Node's default UA, which is the traffic pattern that gets an IP rate-limited on a free hobby API.

While it fails: no new Gutenberg books arrive, and the author birth/death years and Gutenberg bookshelves added in TASK-176.1 never get populated (they wait on a full sync). Standard Ebooks sync and the word-count crawler (gutenberg.pglaf.org mirror) are unaffected.

Outcome: Gutenberg sync uses Project Gutenberg's own offline catalog (rdf-files.tar.bz2, official, updated daily, meant for bulk use). That is one download per sync instead of thousands of API requests, with no third-party dependency.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Gutenberg sync downloads the official RDF catalog archive once per run (from gutenberg.org or an official mirror) instead of calling gutendex.com
- [x] #2 Every field the current sync stores is populated from the RDF: title, authors with birth/death years, language, subjects, bookshelves, download count, EPUB URL and cover URL (derived from the book id where the RDF doesn't list them)
- [x] #3 Whether per-book summaries exist in the RDF is checked; if not, existing summaries are preserved on upsert rather than overwritten with null, and the gap is documented
- [x] #4 The archive is streamed and parsed without loading the whole uncompressed set into memory
- [x] #5 Requests send a descriptive User-Agent with a contact URL; a failed download retries with backoff and leaves existing rows untouched
- [x] #6 Mapping produces the same normalized rows as before for a set of fixture RDF files (title cleanup, tags, author keys)
- [x] #7 agents/catalog.md describes the new source and why Gutendex was dropped
- [x] #8 Tests cover RDF parsing for representative books (multi-author, no cover, non-English, missing fields) and the sync's failure path
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect a real pg<id>.rdf to map fields. 2. RDF parser (fast-xml-parser) to a source-neutral GutenbergRecord; mapBook on top. 3. Change-only upsert with new/changed/unchanged counts, summary preserved. 4. Download to temp file with UA + backoff; stream tar.bz2 entries (unbzip2-stream + tar-stream, approved). 5. Fixtures + tests, one real download for a local full run. 6. Docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Summaries DO exist in the RDF (pgterms:marc520, same generated text Gutendex served). A record without one still keeps the stored summary (COALESCE + compare).

Subjects: LCSH only; LCC call letters (e.g. PR) are dropped.

Audio books (DCMI type Sound) are skipped. ~488 Gutendex-era audio rows (487 without EPUB) stay untouched; deleting them needs a decision.

Real archive: 126.7 MB, downloaded once (6 s). Local full run: 61,670 new, 16,600 changed, 167 s, peak RSS 415 MB. Rerun on the same file: 78,270 unchanged, 0 written.

Deps added with pnpm (approved): unbzip2-stream, tar-stream, @types/tar-stream, @types/unbzip2-stream. Lockfile only gained lines.

Review round fixes: numeric char refs decoded (htmlEntities), CR titles; per-entry failure isolation (>1% unreadable or <50k entries fails the run, Sentry once with count); fixed temp path cleared per run; Content-Length + 1 GB download checks; 5 MB entry cap; SYNCED_COLUMNS drives compare + update set; sorted subjects/shelves; DB-free gutenberg-map.ts; tagsFor moved to lib/tags.ts; lib/user-agent.ts shared with the word-count crawler; caret ranges for the new deps.

Second real download for verification through syncGutenberg(): 79,522 entries, 62,071 changed (one-off: entity decode + sorting), 16,199 unchanged, 1,252 skipped, 0 unreadable, 186 s, peak RSS 481 MB. Titles/authors/summaries containing &# went from 6,443 to 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Gutenberg sync now reads PG's official offline catalog (rdf-files.tar.bz2) instead of crawling Gutendex. One download per run with a descriptive UA and backoff, saved to a temp file before any DB write. The archive is streamed entry by entry (unbzip2-stream + tar-stream) and parsed per RDF. Only new or changed rows are written, with new/changed/unchanged logged; stored summaries are never cleared. New files: sync/gutenberg-rdf.ts (parser), sync/gutenberg-archive.ts (download + stream). sync/gutenberg.ts now maps GutenbergRecord and does the change-only upsert. Tests: parser/mapping on a real RDF plus multi-author/French/minimal/audio/non-book fixtures, archive streaming and a corrupt archive, download UA/retry/give-up, and a DB integration test for change-only writes and summary preservation. Catalog: tsc OK, 176/176 tests. agents/catalog.md updated.
<!-- SECTION:FINAL_SUMMARY:END -->
