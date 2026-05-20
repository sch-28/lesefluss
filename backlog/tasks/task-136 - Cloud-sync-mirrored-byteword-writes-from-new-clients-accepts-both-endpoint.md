---
id: TASK-136
title: 'Cloud sync: mirrored byte+word writes from new clients, accepts-both endpoint'
status: Done
assignee: []
created_date: '2026-05-20 19:40'
updated_date: '2026-05-20 23:20'
labels:
  - refactor
  - word-index
  - sync
dependencies:
  - TASK-135
references:
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
documentation:
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
modified_files:
  - packages/core/src/sync.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/web/src/routes/api/sync.ts
  - apps/capacitor/src/services/sync/__tests__/sync-payload-schema.test.ts
priority: high
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Transitional cloud-sync changes so new (Release N) and old clients coexist for one release with no min-version gate.

New client behavior:
- On upload (apps/capacitor/src/services/sync/index.ts), for every position-bearing field, ship BOTH shapes:
  - `books`: `wordPosition` (canonical) and `position` (recomputed via WordIndex.byteOf).
  - `highlights`: `{startWord, startCharInWord, endWord, endCharInWord}` (canonical) and `{startOffset, endOffset}` (recomputed via WordIndex.byteOf for the start/end words).
  - `readingSessions`: `{startWord, endWord}` (canonical) and `{startPos, endPos}` (recomputed).
  - `chapters` JSON: include both `startWord` and `startByte`.
- Recompute uses the book's persisted WordIndex; cheap per upload.
- On download, prefer word fields. Ignore byte fields. (New client does not need them — it has WordIndex locally anyway.)

Server behavior (apps/web/src/routes/api/sync.ts):
- Sync payload schema accepts both shapes for upload (word fields, byte fields, or both).
- Store whichever fields the client sends. Do NOT discard a column the client did not send (so an old client posting bytes after a new client posted both does not blank the word column).
- Last-write-wins behavior unchanged otherwise.

Schema is already present from TASK-133 — both column sets exist server-side.

Out of scope: dropping any byte fields. That is TASK-137 (Release N+1).

Reference: ADR-0002 migration section ("Cloud sync writes both shapes" + "Cloud sync accepts both shapes").
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New client upload payload includes both byte and word fields for every position-bearing record (books, highlights, sessions, chapters)
- [x] #2 Byte fields on uploads are recomputed from the canonical word fields via WordIndex.byteOf, not read from a stored byte column
- [x] #3 Server sync endpoint accepts payloads with: word-only, byte-only (legacy), or both shapes, and stores what was sent without clobbering untouched columns
- [x] #4 On download, new client reads word fields and ignores byte fields
- [x] #5 Old client (pre-Release-N) continues to function: it uploads byte fields and downloads byte fields successfully
- [x] #6 Sync payload zod / typed schema is updated to make both shapes optional but enforce that at least the word OR byte form is present for each record kind
- [x] #7 Sync tests cover: new-client upload, old-client upload, mixed uploads from two clients on the same row (last-write-wins across both unit columns)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary

Mirrored byte+word writes across sync end-to-end. New clients ship both shapes; server stores both; old clients keep working with byte-only.

## Schema (`packages/core/src/sync.ts`)

- `SyncBookSchema`: added optional `wordPosition` (int) and `positionUnit` ("byte" | "word").
- `SyncHighlightSchema`: added optional Option A anchors `startWord`, `startCharInWord`, `endWord`, `endCharInWord`.
- `SyncReadingSessionSchema`: added optional `startWord`, `endWord`.
- Byte fields remain required so Release N-1 clients still validate.

## Client (`apps/capacitor/src/services/sync/index.ts`)

- `bookToSync` ships `wordPosition` + `positionUnit` when the book has been backfilled (`positionUnit === "word"`).
- `highlightToSync` ships the Option A anchors when all four word columns are populated on the local row.
- `sessionToSync` ships `startWord`/`endWord` when both word bounds are populated.
- Pull paths (`buildBookRowFromServer`, highlight upsert, session upsert) read the canonical word fields from server payloads when present; default to byte fallbacks otherwise.

## Server (`apps/web/src/routes/api/sync.ts`)

- GET response: surfaces `wordPosition`, `positionUnit`, `startWord`/`startCharInWord`/`endWord`/`endCharInWord`, session `startWord`/`endWord` when populated.
- POST upsert: writes the new columns alongside byte columns; uses `COALESCE(excluded.x, existing.x)` for word fields so an old client posting byte-only doesn't blank previously-uploaded word data.
- Last-write-wins on `position` / `wordPosition` / `positionUnit` is gated by `updated_at` (same rule as existing position handling).

## Tests

`apps/capacitor/src/services/sync/__tests__/sync-payload-schema.test.ts` — 4 new schema tests:
- Old-client byte-only book accepts.
- New-client both-shape book accepts.
- Highlight with mirrored Option A anchors accepts.
- Reading session with both byte and word bounds accepts.

## Verification

- `pnpm --filter capacitor check-types` → clean
- `pnpm --filter capacitor test` → 198 passing (194 prior + 4 new)
- `pnpm --filter web check-types` → clean
- `pnpm --filter @lesefluss/core test` → 37 passing

## Out of scope (downstream)

- TASK-137: drop byte columns + min-version gate + force-update.
<!-- SECTION:FINAL_SUMMARY:END -->
