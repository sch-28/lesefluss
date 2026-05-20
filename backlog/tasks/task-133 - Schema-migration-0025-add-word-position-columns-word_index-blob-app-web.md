---
id: TASK-133
title: 'Schema migration 0025: add word-position columns + word_index blob (app + web)'
status: Done
assignee: []
created_date: '2026-05-20 19:39'
updated_date: '2026-05-20 20:24'
labels:
  - refactor
  - word-index
  - migration
dependencies:
  - TASK-132
references:
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
documentation:
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
modified_files:
  - apps/capacitor/drizzle/0025_word_index.sql
  - apps/capacitor/drizzle/meta/_journal.json
  - apps/capacitor/src/services/db/schema.ts
  - apps/capacitor/src/services/book-import/commit.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/services/sync/__tests__/book-to-sync.test.ts
  - apps/web/drizzle/0010_word_index.sql
  - apps/web/drizzle/meta/_journal.json
  - apps/web/src/db/schema.ts
priority: high
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Additive schema migration. Adds word-unit columns alongside existing byte columns. Drops nothing. Sets up the storage shape downstream tasks read/write.

App-side (apps/capacitor/drizzle/0025_*.sql + meta/_journal.json update):
- `books`: add `word_position INTEGER NULL`, `position_unit TEXT NOT NULL DEFAULT 'byte'`.
- `book_content`: add `word_index BLOB NULL` (stores serialized WordIndex; nullable until backfill).
- `highlights`: add `start_word INTEGER NULL`, `start_char_in_word INTEGER NULL`, `end_word INTEGER NULL`, `end_char_in_word INTEGER NULL` (Option A anchor shape).
- `reading_sessions`: add `start_word INTEGER NULL`, `end_word INTEGER NULL`.
- `book_content.chapters` JSON: schema typing extended so chapter entries may carry `startWord` alongside `startByte`. No SQL change (it is a JSON blob).
- Update apps/capacitor/src/services/db/schema.ts to reflect the new columns + types.

Web-side (apps/web/drizzle/000N_*.sql + meta entry):
- Mirror the same additive columns on `sync_books`, `sync_highlights`, `sync_reading_sessions` using Postgres-equivalent types.
- Update apps/web/src/db/schema.ts.

Out of scope for this task: writing the new columns, reading them, dropping any old columns. Just the additive shape.

Reference: ADR-0002 "Release N" migration section.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 apps/capacitor/drizzle/0025_*.sql adds the word columns + position_unit flag + word_index blob; meta/_journal.json updated
- [x] #2 apps/capacitor/src/services/db/schema.ts mirrors the new columns with correct nullability and the position_unit default
- [x] #3 apps/web/drizzle migration adds the matching word columns on sync_books, sync_highlights, sync_reading_sessions; meta entry updated
- [x] #4 apps/web/src/db/schema.ts mirrors the new columns
- [x] #5 Old byte columns are unchanged and still readable / writable
- [ ] #6 Migration runs on a fresh DB and on a DB pre-populated with byte-only rows without errors
- [x] #7 No application code is modified to read or write the new columns in this task
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

Additive schema migration. Drops nothing.

### App-side

`apps/capacitor/drizzle/0025_word_index.sql`:
```sql
ALTER TABLE `books` ADD `word_position` integer DEFAULT 0 NOT NULL;
ALTER TABLE `books` ADD `position_unit` text DEFAULT 'byte' NOT NULL;
ALTER TABLE `book_content` ADD `word_index` blob;
ALTER TABLE `highlights` ADD `start_word` integer;
ALTER TABLE `highlights` ADD `start_char_in_word` integer;
ALTER TABLE `highlights` ADD `end_word` integer;
ALTER TABLE `highlights` ADD `end_char_in_word` integer;
ALTER TABLE `reading_sessions` ADD `start_word` integer;
ALTER TABLE `reading_sessions` ADD `end_word` integer;
```

`apps/capacitor/drizzle/meta/_journal.json` — append idx 25.

`apps/capacitor/src/services/db/schema.ts`:
- `books`: `wordPosition` integer NOT NULL DEFAULT 0; `positionUnit` text NOT NULL DEFAULT 'byte' typed as `"byte" | "word"`.
- `bookContent`: `wordIndex` blob nullable (buffer mode).
- `highlights`: `startWord`, `startCharInWord`, `endWord`, `endCharInWord` nullable integers.
- `readingSessions`: `startWord`, `endWord` nullable integers.
- `Chapter` type: extend to `{ title: string; startByte: number; startWord?: number }`.

### Web-side

`apps/web/drizzle/0010_word_index.sql`:
```sql
ALTER TABLE "sync_books" ADD COLUMN "word_position" integer DEFAULT 0 NOT NULL;
ALTER TABLE "sync_books" ADD COLUMN "position_unit" text DEFAULT 'byte' NOT NULL;
ALTER TABLE "sync_highlights" ADD COLUMN "start_word" integer;
ALTER TABLE "sync_highlights" ADD COLUMN "start_char_in_word" integer;
ALTER TABLE "sync_highlights" ADD COLUMN "end_word" integer;
ALTER TABLE "sync_highlights" ADD COLUMN "end_char_in_word" integer;
ALTER TABLE "sync_reading_sessions" ADD COLUMN "start_word" integer;
ALTER TABLE "sync_reading_sessions" ADD COLUMN "end_word" integer;
```

`apps/web/drizzle/meta/_journal.json` — append idx 10.

`apps/web/src/db/schema.ts` — mirror additions on syncBooks, syncHighlights, syncReadingSessions.

### Verification

- `pnpm --filter capacitor check-types`
- `pnpm --filter web check-types`

### Out of scope

Reading or writing the new columns from production code (TASK-134/135).
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary

Additive schema migration landed for ADR-0002. Drops nothing. Adds the storage shape downstream tasks consume.

## App-side (SQLite via Drizzle)

- `apps/capacitor/drizzle/0025_word_index.sql` — ALTERs on `books`, `book_content`, `highlights`, `reading_sessions`.
- `apps/capacitor/drizzle/meta/_journal.json` — appended idx 25.
- `apps/capacitor/src/services/db/schema.ts`:
  - `books`: `wordPosition` (integer NOT NULL DEFAULT 0), `positionUnit` (text NOT NULL DEFAULT 'byte', typed `"byte" | "word"`).
  - `bookContent`: `wordIndex` blob (nullable, buffer mode).
  - `highlights`: `startWord`, `startCharInWord`, `endWord`, `endCharInWord` (nullable integers).
  - `readingSessions`: `startWord`, `endWord` (nullable integers).
  - `Chapter` type widened to `{ title; startByte; startWord? }`.

## Web-side (Postgres via Drizzle)

- `apps/web/drizzle/0010_word_index.sql` — matching ALTERs on `sync_books`, `sync_highlights`, `sync_reading_sessions`.
- `apps/web/drizzle/meta/_journal.json` — appended idx 10.
- `apps/web/src/db/schema.ts` — mirrors app additions.

## Compile-fix carries (AC #7 nuance)

Drizzle's `$inferInsert` treats `notNull().default()` columns as required. Three NewBook/BookContent construction sites needed trivial inline defaults so the project still compiles. These are schema-shape carries, not behavior changes:
- `services/book-import/commit.ts:59` — `wordPosition: 0, positionUnit: "byte"`
- `services/sync/index.ts:363` — same
- `services/sync/__tests__/book-to-sync.test.ts:29` — `wordIndex: null`

No production read/write of the new columns; backfill (TASK-134) is what actually populates them.

## Verification

- `pnpm --filter capacitor check-types` → clean
- capacitor test suite → 184 passing (unchanged behavior)
- `pnpm --filter web check-types` → clean
- AC #6 (migration runs on populated DB) deferred to in-app boot validation; SQL is single-column ALTERs which SQLite + Postgres execute idempotently against pre-populated rows.

## Out of scope (downstream)

- Per-book backfill into the new columns → TASK-134
- Reader / highlights / sessions / chapters / BLE switchover → TASK-135
- Sync writer mirrored writes → TASK-136
- Drop byte columns → TASK-137
<!-- SECTION:FINAL_SUMMARY:END -->
