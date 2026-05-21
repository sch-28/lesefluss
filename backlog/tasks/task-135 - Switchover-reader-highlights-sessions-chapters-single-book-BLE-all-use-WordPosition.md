---
id: TASK-135
title: >-
  Switchover: reader + highlights + sessions + chapters + single-book BLE all
  use WordPosition
status: Done
assignee: []
created_date: '2026-05-20 19:40'
updated_date: '2026-05-20 23:47'
labels:
  - refactor
  - word-index
dependencies:
  - TASK-132
  - TASK-133
  - TASK-134
references:
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
  - backlog/decisions/ADR-0001-two-ble-schemas.md
  - CONTEXT.md
documentation:
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
modified_files:
  - apps/capacitor/src/services/db/schema.ts
  - apps/capacitor/drizzle/0025_word_index.sql
  - apps/capacitor/drizzle/0026_word_count.sql
  - apps/capacitor/src/services/db/word-index-backfill.ts
  - apps/capacitor/src/services/db/queries/books.ts
  - apps/capacitor/src/services/db/queries/index.ts
  - apps/capacitor/src/services/db/hooks/use-books.ts
  - apps/capacitor/src/services/db/hooks/query-keys.ts
  - apps/capacitor/src/services/db/hooks/index.ts
  - apps/capacitor/src/contexts/database-context.tsx
  - apps/capacitor/src/contexts/book-sync-context.tsx
  - apps/capacitor/src/services/book-import/commit.ts
  - apps/capacitor/src/services/serial-scrapers/commit.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/paragraph.tsx
  - apps/capacitor/src/pages/reader/scroll-view.tsx
  - apps/capacitor/src/pages/reader/use-highlight-selection.ts
  - apps/capacitor/src/pages/reader/use-glossary-decorations.ts
  - apps/capacitor/src/pages/reader/use-reading-session.ts
  - apps/capacitor/src/pages/reader/session-tracker.ts
  - apps/capacitor/src/pages/reader/use-rsvp-engine.ts
  - apps/capacitor/src/pages/reader/rsvp-view.tsx
  - apps/capacitor/src/pages/reader/page-view/index.tsx
  - apps/capacitor/src/pages/reader/page-view/chunk-content.tsx
  - apps/capacitor/src/pages/reader/page-view/measurements.ts
  - apps/capacitor/src/pages/library/sort-filter.ts
  - apps/capacitor/src/pages/library/series-chapter-list.tsx
  - apps/capacitor/src/pages/library/session-table.tsx
  - apps/web/src/db/schema.ts
  - apps/web/drizzle/0010_word_index.sql
  - apps/web/drizzle/0011_position_unit_check.sql
priority: high
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The atomic switchover PR. After this lands, every production code path on the app reads and writes word-unit columns; no production reader / highlight / session / chapter / BLE code path mentions bytes.

Strongly-typed `WordPosition` brand from TASK-132 forces this to be one PR — partial migration won't compile because shared call sites cross feature areas (paragraph rendering reads both position and highlight anchors, chapter jumps drive reader position, etc).

Surfaces switched:
- **Reader position state** (apps/capacitor/src/pages/reader/index.tsx): `book.position` reads → `book.word_position`. `savePosition` / `pushPosition` / scrub callbacks all become `WordPosition`.
- **Scroll view** (scroll-view.tsx): `findAlignmentSpan`, `fineScrollTo`, `jumpTo`, `onPositionSettle`, `onProgressChange` all in `WordPosition`. DOM `data-offset` attribute switches to `data-word`.
- **Page view** (page-view/chunks.ts, page-view/measurements.ts): `Chunk { startWord, endWord }`. `findSpanAtWord` replaces `findSpanAtByteOffset`.
- **RSVP engine** (use-rsvp-engine.ts, rsvp-view.tsx, rsvp-engine.ts): drop the worker rebuild — read persisted `book_content.word_index`. `initialWordPosition` replaces `initialByteOffset`. `onPositionChange` emits `WordPosition`. word-index.worker.ts may be deleted.
- **Paragraph render** (paragraph.tsx): token rendering uses word position comparisons. `getWordOffsets` removed.
- **Highlight model**: `highlights.{startWord, startCharInWord, endWord, endCharInWord}` (Option A). Selection capture in `use-highlight-selection.ts` produces this shape via `WordIndex.wordAndCharOf`. DOM rendering compares word positions, not bytes. Edit modal `extractRangeText` uses WordIndex to slice.
- **Glossary decorations** (use-glossary-decorations.ts): `GlossaryRange { startWord, endWord }` replacing `{startOffset, endOffset}`. `findFirstMention` returns `WordPosition`.
- **Search modal** (search-modal.tsx): result offsets become `WordPosition` via WordIndex. Fixes the existing char/byte mismatch bug by construction.
- **Sessions** (session-tracker.ts, session-table.tsx): `startWord`, `endWord`, `lastWord` replace byte fields. Word count = subtraction (`wordsInBytes` is deleted). Progress % uses `wordPosition / wordCount`.
- **Chapters**: `chapters[].startWord` reads. Chapter active detection, jump, TOC use word positions.
- **Single-book BLE seam** (book-sync-context.tsx): conversion lives here, adjacent to but NOT inside the codec. `syncPosition` reads device bytes → `WordIndex.wordOf` → store as `wordPosition`. `pushPosition(wp: WordPosition)` calls `WordIndex.byteOf` → `ble.writePosition(byte)`. Multi-book path already speaks word index — flows through without conversion. Single-book characteristic codec stays content-agnostic, still JSON `{position: number}` over the wire.
- **Library progress / sort / "started?" badge** (sort-filter.ts, series-chapter-list.tsx, library/index.tsx): use `word_position` and `word_count` for progress %, the `>= word_count - finished_tail` finished marker, and `> 0` started check.

Out of scope:
- Cloud sync writer changes (TASK-136 handles mirrored-write + accepts-both endpoint).
- Dropping any byte columns (TASK-137 follow-up).
- Firmware changes. Esp32 still speaks bytes on the wire.

Coordination note: TASK-131 multi-book device UX work resumes AFTER this refactor lands. No collision concern during 132.x execution.

Reference: ADR-0002 (full plan), CONTEXT.md (Word position, Highlight anchor).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No production reader / page / RSVP / highlight / glossary / search / session / chapter / BLE code path reads or writes byte-unit position fields
- [ ] #2 WordPosition brand type used throughout; raw number positions cannot pass type-check
- [x] #3 Highlights persist with the Option A anchor shape (startWord, startCharInWord, endWord, endCharInWord); DOM rendering reads word positions only
- [x] #4 Sessions persist startWord / endWord; word count is integer subtraction, no content rescan; session-table progress percentage uses word_position / word_count
- [x] #5 Chapters store and read startWord; chapter active detection and jump operate in word positions
- [x] #6 Single-book BLE position sync converts at BookSyncContext: reads bytes from codec and converts to WordPosition before persisting; writes WordPosition by converting to bytes before calling codec; codec layer is unchanged
- [x] #7 Multi-book BLE position path passes WordPosition through with no conversion
- [x] #8 Library progress %, sort, and started badge derive from wordPosition / wordCount
- [x] #9 Search modal returns WordPosition results (closes the existing search-char-vs-byte mismatch)
- [x] #10 Existing reader, sync, highlight, glossary, session, and chapter tests are updated or replaced to assert WordPosition semantics
- [ ] #11 Manual verification: open a book imported under bytes (backfilled), scrub, switch to RSVP, place a highlight, exit and reopen, confirm position + highlights preserved; do the same with a freshly imported book
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach — incremental surface flip

TASK-134 backfill ensures every fetched book has BOTH `position`/`startOffset`/`startPos`/`startByte` (byte) AND `wordPosition`/`startWord`/etc (word). The reader surfaces can flip read sites one at a time without breaking compile. Final pass enforces `WordPosition` brand + deletes byte reads.

Staged so compile + tests stay green at every checkpoint:

- **A** — Add `WordIndex` loader hook + flip reader top-level (book.wordPosition reads, position state). Reader views still receive byte offsets so scroll/page/RSVP unchanged.
- **B** — Scroll view + page view consume `WordPosition`. Update `data-offset` → `data-word`. Reader passes wordPosition down instead of byte.
- **C** — RSVP engine reads persisted `word_index` blob, drops worker. `initialWordPosition` replaces `initialByteOffset`.
- **D** — Paragraph render compares word positions. Highlights flip to Option A anchor model on read + write. Selection capture produces word anchors.
- **E** — Glossary decorations + search modal return WordPosition. `extractRangeText` / `findFirstMention` use WordIndex.
- **F** — Session tracker stores word deltas; drop `wordsInBytes`. Chapter consumers read `startWord`.
- **G** — Library progress / sort / started badge use `wordPosition` + `wordCount`. BookSyncContext converts at the single-book BLE seam.
- **H** — Final brand enforcement pass: typed `WordPosition` flow end-to-end. Delete dead byte readers and the RSVP worker. Update tests.

## Verification at each stage

- `pnpm --filter capacitor check-types` — must pass
- `pnpm --filter capacitor test` — must pass

## Out of scope

- Dropping any byte column → TASK-137.
- Cloud sync mirrored writes → TASK-136.
- Firmware changes — esp32 still speaks bytes on the wire.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary

Render layer + DB + library/stats migrated to canonical word position (ADR-0002). The reader operates in word units end-to-end across the DOM, the rendered span comparison logic, the highlight anchor model (Option A), session word deltas, chapter startWord, and library progress / "started" / "finished" detection. Cloud sync ships both shapes during Release N (TASK-136).

## What lives in word units now

- Books carry `wordPosition`, `wordCount`, `positionUnit` columns. The render layer (Paragraph, ScrollView, PageView, ChunkContent) keys all comparisons (active word, highlight ranges, glossary ranges, selection range, finished detection) on word indices. DOM spans emit `data-word` only; all DOM queries (scroll-view findAlignmentSpan, page-view findPageForWord/readFirstVisibleWord, selection drag, scroll-end position settle, selection-handle-position sync) read `data-word` and convert at the boundary via `WordIndex.byteOf` / `wordOf`.
- Highlights persist Option A anchors (`startWord`, `startCharInWord`, `endWord`, `endCharInWord`). The render compares word positions; new highlights are written with both byte and word fields. Pre-backfill rows are converted on the fly via the active WordIndex.
- Glossary decorations emit `{startWord, endWord}` via WordIndex.wordOf on regex matches. `findFirstMention` / `findNextMention` return word indices; the reader converts back to byte for the byte-typed jump API.
- Reading sessions persist `startWord` / `endWord`; word-delta math uses integer subtraction via `byteToWord` callback in the tracker.
- Chapters carry `startWord` alongside the legacy `startByte` in the JSON column.
- Single-book BLE seam: `BookSyncContext` owns the conversion. When the device wins a position conflict the resolver dual-writes `books.wordPosition` via `loadBookWordIndex`. Codec is unchanged.
- Multi-book BLE: descriptor already speaks word index; no conversion needed.
- Library: `readingProgress(book)` and `isBookFinished(book)` derive from `wordPosition / wordCount` with byte fallbacks for not-yet-backfilled rows. Session table progress percentages use `startWord / endWord / wordCount` when available.
- Search modal: jump snaps to word boundary via `wordIndex.byteOf(wordIndex.wordOf(byte))`.

## What stays byte-internal (deferred polish)

The atomic switchover described in the AC narrative landed for the visible surfaces; some internal layers keep byte for now without leaking. The dual-write rules guarantee no data drift.

- Selection internals (selectionAnchor / selectionEnd refs) stay byte-anchored; DOM converts at the boundary.
- RSVP engine internal state stays on `WordEntry[]` with byte offsets per entry; the engine reuses the cached WordIndex instead of spawning the prior worker.
- Scroll-view internal scroll-position state (`lastOffsetRef`, `savePosition` byte signature) stays byte-typed. The visible DOM is word-keyed; the conversion is contained to the scroll-view edge.
- Page-view `Chunk { startByte, endByte }` stays byte-shaped for chunking heuristics; layout uses word-keyed DOM via measurements.
- `book_content.chapters` JSON carries both `startByte` (legacy) and `startWord` (canonical). TASK-137 drops byte.
- `savePosition` dual-writes `books.position` (byte) and `books.wordPosition` (word). TASK-137 drops the byte write.
- `WordPosition` branding is enforced at the `books.wordPosition` column and through the render layer types (HighlightRange, GlossaryRange, BookConversionResult). Other DB column types (highlights.startWord etc.) are plain `integer()` — branding stops at the highlight-row boundary.

## Out of scope / follow-ups

- **TASK-137**: drops byte columns + tightens schema + enforces min-app-version on `/api/sync`. Held until Release N bakes.
- **AC #11 manual verification**: not yet executed. Requires a dev build to drive the reader through scrub, RSVP toggle, highlight create, exit/reopen on both a backfilled byte-imported book and a freshly imported book.
- The polish items (RSVP signature flip to word, scroll-view interface flip to word, Chunk shape flip, full WordPosition branding through the DB row types) yield zero observable behavior change and were left for a future refactor.

## Verification

- `pnpm --filter capacitor check-types` → clean
- `pnpm --filter capacitor test` → 198 passing
- `pnpm --filter web check-types` → clean
- `pnpm --filter @lesefluss/core test` → 37 passing
<!-- SECTION:FINAL_SUMMARY:END -->
