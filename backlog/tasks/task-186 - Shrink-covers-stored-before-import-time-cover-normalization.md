---
id: TASK-186
title: Shrink covers stored before import-time cover normalization
status: To Do
assignee: []
created_date: '2026-10-02 17:13'
updated_date: '2026-10-02 17:14'
labels:
  - performance
  - storage
  - images
milestone: m-14
dependencies:
  - TASK-100
priority: low
ordinal: 132000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-100 normalizes covers on import (`normalizeCover` in packages/book-import/src/utils/cover-image.ts: 600 px longest side, WebP/JPEG, 30 KiB budget). Covers already in user databases are untouched; an EPUB cover was stored verbatim (often 100 KB to several MB of base64), and `getBookCovers` loads all of them on every library render.

Design notes from TASK-100:
- Local shrink: background pass over `book_content` rows whose `length(cover_image)` exceeds the budget, run `normalizeCoverDataUrl`, write only `book_content.cover_image`. Do NOT touch `books.updated_at` / `metadata_updated_at`, so it never triggers a sync push.
- Server copy: the server keeps its cover via `COALESCE(excluded.cover_image, sync_books.cover_image)` and the client only pushes content once per book (`server-content-cache.ts`), so a local shrink never reaches the server. Other devices pulling a new book still get the big cover. Options: normalize on inbound pull in the "new book from server" path, and/or a one-off server-side job (e.g. sharp) over `sync_books.cover_image` / `sync_series.cover_image`. Forcing a client content re-push to replace it would re-upload whole books and is not wanted.
- Web build: jeep-sqlite rewrites the whole IndexedDB entry per write, so batch the updates (one transaction) and yield between covers; run once, flag in Preferences.
- Decode on the main thread costs ~30-80 ms per cover; consider the existing image-prepare worker.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Existing covers above the budget are shrunk once per device in the background without blocking startup
- [ ] #2 The pass never changes books.updated_at or metadata_updated_at and triggers no sync push
- [ ] #3 Decision recorded for server-side copies (inbound-pull normalization and/or server job)
- [ ] #4 Web build writes are batched so the IndexedDB rewrite happens a bounded number of times
<!-- AC:END -->
