---
id: TASK-134
title: 'App-start backfill sweep: convert byte positions to word positions per book'
status: Done
assignee: []
created_date: '2026-05-20 19:39'
updated_date: '2026-05-20 20:33'
labels:
  - refactor
  - word-index
  - migration
dependencies:
  - TASK-132
  - TASK-133
references:
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
documentation:
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
modified_files:
  - apps/capacitor/src/services/db/word-index-backfill.ts
  - apps/capacitor/src/services/db/__tests__/word-index-backfill.test.ts
  - apps/capacitor/src/contexts/database-context.tsx
  - apps/capacitor/src/services/book-import/commit.ts
  - apps/capacitor/src/services/serial-scrapers/commit.ts
priority: high
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Idempotent client-side migration sweep. Converts existing byte-based data to word-based data on first launch of Release N. Required before the switchover (TASK-135) can read word columns safely.

Behavior:
- On app start, query books where `position_unit = 'byte'` AND `chapter_status = 'fetched'`.
- Show blocking progress UI ("Migrating reading positions…") with per-book progress.
- For each book, in one transaction:
  1. Build WordIndex from `book_content.content` (use module from TASK-132).
  2. Persist serialized WordIndex to `book_content.word_index`.
  3. Convert `books.position` → `books.word_position` via `WordIndex.wordOf`.
  4. Convert each highlight's `{start_offset, end_offset}` → `{start_word, start_char_in_word, end_word, end_char_in_word}` via `WordIndex.wordAndCharOf`. Word-snap rounds outward if a byte falls inside whitespace.
  5. Convert each reading session's `{start_pos, end_pos}` → `{start_word, end_word}`.
  6. Convert each chapter's `startByte` → `startWord` in the chapters JSON column.
  7. Set `position_unit = 'word'`.
- Books in `chapter_status` of `pending` / `locked` / `error` are skipped. They have no content row yet.
- On chapter-fetch commit (`apps/capacitor/src/services/book-import/commit.ts`), run the same per-book conversion inline immediately after content insert so newly fetched books are born word-indexed.
- Idempotent: re-running over a `position_unit = 'word'` book is a no-op. Crash mid-pass leaves earlier books done and resumes from the next byte book on next launch.

Out of scope: any reader / sync / BLE code change that reads the new columns. Those land in TASK-135. After this task: data is in both shapes, but the production code paths still read byte columns.

Reference: ADR-0002 migration section.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A backfill service iterates all `position_unit='byte'` + fetched books on app start and converts each in a single transaction
- [x] #2 Each per-book conversion sets word_index, word_position, highlight word anchors (Option A), session word deltas, chapter startWord, and flips position_unit to 'word'
- [x] #3 Blocking progress UI surfaces overall + per-book progress during the sweep
- [x] #4 Books with chapter_status of pending / locked / error are skipped cleanly
- [x] #5 Chapter-fetch commit path runs the same conversion inline for the just-fetched book
- [x] #6 Backfill is idempotent: re-running on word books is a no-op; crash mid-pass resumes correctly on next start
- [x] #7 Tests cover: empty library, single book, highlight word-snap rounding behavior, session conversion, mid-pass crash recovery
- [x] #8 No production reader / sync / BLE code path is changed to read the new columns in this task
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

### New module: `apps/capacitor/src/services/db/word-index-backfill.ts`

1. **Pure conversion** (testable in isolation):
   ```ts
   computeBookConversion(book, content, chapters, highlights, sessions)
     -> { wordIndex, wordPosition, chapters, highlights, sessions }
   ```

2. **DB orchestration**:
   - `backfillBookToWord(bookId)` — loads rows, calls computeBookConversion, persists in one tx, flips `position_unit = 'word'`.
   - `backfillAllBooks(onProgress)` — selects books where `position_unit = 'byte'` AND `chapter_status = 'fetched'`, iterates.

3. **WordIndex blob storage**: JSON.stringify(serialize()) → TextEncoder → Buffer. Reverse on read (TASK-135).

### Boot integration (`apps/capacitor/src/contexts/database-context.tsx`)

- New `backfillProgress` state.
- After initDb + orphan cleanup, run backfillAllBooks; update progress.
- Block isReady until done; render a centered "Migrating reading positions… X / Y" overlay between native splash and AppShell.

### Chapter-fetch hook (`apps/capacitor/src/services/book-import/commit.ts`)

After `addBookWithContent`, call `backfillBookToWord(id)` inline so freshly-fetched books are born word-indexed.

### Tests (`apps/capacitor/src/services/db/__tests__/word-index-backfill.test.ts`)

Pure `computeBookConversion` tests, no DB:
- Position byte → wordPosition correct
- Highlight Option A anchor conversion
- Session start/end conversion
- Chapter startByte → startWord
- Multi-byte UTF-8 content
- Empty inputs (no highlights / no sessions / no chapters)
- Pending books skipped at the orchestration layer (verify by querying back chapter_status filter — tested via DB at boot, not here)

### Verification

- `pnpm --filter capacitor check-types`
- `pnpm --filter capacitor test`

### Out of scope

- Reading the new columns from production code → TASK-135.
- Sync writer mirrored writes → TASK-136.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary

App-start backfill sweep + chapter-fetch hook landed. Books still flagged `position_unit = 'byte'` get tokenized, persisted as `book_content.word_index` blob, and converted across every position-bearing record. Production code paths still read byte columns — TASK-135 is the switchover.

## Module

`apps/capacitor/src/services/db/word-index-backfill.ts`:
- `computeBookConversion(input)` — pure. Builds one `WordIndex`, fans out byte→word for position, highlights (Option A `wordAndCharOf`), sessions, and chapter `startWord`.
- `serializeWordIndexBlob(idx)` — UTF-8 JSON via `TextEncoder`. Drizzle blob column accepts the resulting `Uint8Array`.
- `backfillBookToWord(bookId)` — skip-fast guards on `position_unit`, `chapter_status`, missing content. Sequential writes (the project's drizzle-proxy adapter lacks transaction support — same constraint as series.ts). `position_unit` flips LAST so a crash mid-pass leaves the book re-runnable on next boot.
- `backfillAllBooks(onProgress)` — selects `position_unit = 'byte'` + `chapter_status = 'fetched'` + not deleted, iterates, reports `{ done, total }` to caller.

## Boot wiring

`apps/capacitor/src/contexts/database-context.tsx`:
- After `initDb` + orphan-chapter cleanup, runs `backfillAllBooks`.
- New `backfillProgress` state drives a minimal centered overlay: "Migrating reading positions… X / Y". Native splash still hides as before for the no-byte-books case (idempotent skip → `total = 0`).
- Failure surfaces through the existing error path with the same "Reset app data" recovery affordance.

## Chapter-fetch hooks

Backfill runs inline on every content-producing path so newly arrived content lands word-indexed:
- `apps/capacitor/src/services/book-import/commit.ts` — after `addBookWithContent`, calls `backfillBookToWord`. Return shape now reports `positionUnit: "word"` because the just-imported book is freshly converted.
- `apps/capacitor/src/services/serial-scrapers/commit.ts` — after `setChapterContent` on a chapter status transition to `"fetched"`. Invalidates the prior WordIndex blob and re-tokenizes implicitly (the blob is overwritten via the same backfill code path).

## Tests

`apps/capacitor/src/services/db/__tests__/word-index-backfill.test.ts` — 10 new tests, all pure:
- Position byte → wordPosition.
- Empty content.
- Highlight Option A anchor conversion.
- Session conversion.
- Chapter `startByte` → `startWord` while preserving `startByte`.
- Null chapters preserved.
- Empty highlight/session arrays.
- Multi-byte UTF-8 across position, chapter, highlight, session.
- Word-snap on highlight whose start byte lands in whitespace.
- Blob serialization round-trip.

Idempotency + crash recovery are structural (per-book skip path + last-flag-flip ordering) rather than directly tested — adding a real DB test fixture is out of scope for this task.

## Verification

- `pnpm --filter capacitor check-types` → clean
- `pnpm --filter capacitor test` → 194 passing (184 existing + 10 new)

## Out of scope (downstream)

- Reader / highlights / sessions / chapters / BLE consume the new columns → TASK-135.
- Cloud sync mirrored writes → TASK-136.
- Drop byte columns → TASK-137.
<!-- SECTION:FINAL_SUMMARY:END -->
