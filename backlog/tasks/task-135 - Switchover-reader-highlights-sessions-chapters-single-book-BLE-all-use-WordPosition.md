---
id: TASK-135
title: >-
  Switchover: reader + highlights + sessions + chapters + single-book BLE all
  use WordPosition
status: In Progress
assignee: []
created_date: '2026-05-20 19:40'
updated_date: '2026-05-20 20:57'
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
- [ ] #1 No production reader / page / RSVP / highlight / glossary / search / session / chapter / BLE code path reads or writes byte-unit position fields
- [ ] #2 WordPosition brand type used throughout; raw number positions cannot pass type-check
- [ ] #3 Highlights persist with the Option A anchor shape (startWord, startCharInWord, endWord, endCharInWord); DOM rendering reads word positions only
- [ ] #4 Sessions persist startWord / endWord; word count is integer subtraction, no content rescan; session-table progress percentage uses word_position / word_count
- [ ] #5 Chapters store and read startWord; chapter active detection and jump operate in word positions
- [ ] #6 Single-book BLE position sync converts at BookSyncContext: reads bytes from codec and converts to WordPosition before persisting; writes WordPosition by converting to bytes before calling codec; codec layer is unchanged
- [ ] #7 Multi-book BLE position path passes WordPosition through with no conversion
- [ ] #8 Library progress %, sort, and started badge derive from wordPosition / wordCount
- [ ] #9 Search modal returns WordPosition results (closes the existing search-char-vs-byte mismatch)
- [ ] #10 Existing reader, sync, highlight, glossary, session, and chapter tests are updated or replaced to assert WordPosition semantics
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
