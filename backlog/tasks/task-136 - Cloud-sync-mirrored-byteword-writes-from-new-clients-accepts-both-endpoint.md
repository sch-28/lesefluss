---
id: TASK-136
title: 'Cloud sync: mirrored byte+word writes from new clients, accepts-both endpoint'
status: To Do
assignee: []
created_date: '2026-05-20 19:40'
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
- [ ] #1 New client upload payload includes both byte and word fields for every position-bearing record (books, highlights, sessions, chapters)
- [ ] #2 Byte fields on uploads are recomputed from the canonical word fields via WordIndex.byteOf, not read from a stored byte column
- [ ] #3 Server sync endpoint accepts payloads with: word-only, byte-only (legacy), or both shapes, and stores what was sent without clobbering untouched columns
- [ ] #4 On download, new client reads word fields and ignores byte fields
- [ ] #5 Old client (pre-Release-N) continues to function: it uploads byte fields and downloads byte fields successfully
- [ ] #6 Sync payload zod / typed schema is updated to make both shapes optional but enforce that at least the word OR byte form is present for each record kind
- [ ] #7 Sync tests cover: new-client upload, old-client upload, mixed uploads from two clients on the same row (last-write-wins across both unit columns)
<!-- AC:END -->
