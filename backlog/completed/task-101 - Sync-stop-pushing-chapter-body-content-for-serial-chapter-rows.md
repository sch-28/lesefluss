---
id: TASK-101
title: 'Sync: stop pushing chapter body content for serial chapter rows'
status: Done
assignee: []
created_date: '2026-04-26 23:31'
updated_date: '2026-04-26 15:40'
labels: []
milestone: m-11
dependencies:
  - TASK-37
references:
  - apps/capacitor/src/services/sync/index.ts
  - apps/web/src/routes/api/sync.ts
  - apps/web/drizzle/0007_drop_chapter_content.sql
  - packages/rsvp-core/src/sync.ts
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-37. Web-novel chapter rows (`books.series_id IS NOT NULL`) were syncing their full plain-text `content` (and on first push, `cover_image` and TOC `chapters` JSON) to `sync_books`. Multiplied across hundreds of chapters per series, this clogged the server DB with data that is re-derivable: the reader already refetches chapter content from the upstream provider whenever `chapter_status = 'pending'` (see `apps/capacitor/src/pages/reader/chapter-fetch.ts`).

Change: chapter rows now sync only their lightweight metadata (`bookId`, `title`, `position`, `seriesId`, `chapterIndex`, `chapterSourceUrl`, `chapterStatus`, `deleted`, `updatedAt`). Per-chapter reading position, highlights/glossary `bookId` stability, and series progress all survive restore — only the chapter body text is lost on a fresh device, and it auto-refetches on open.

Trade-off accepted: if the upstream provider takes a chapter offline, a fresh-device restore won't have a local copy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Capacitor `bookToSync` skips content/coverImage/chapters when `book.seriesId` is set
- [x] #2 Capacitor `pushSync` skips `getBookContent` for chapter rows
- [x] #3 Server upsert in /api/sync hard-nulls content/cover/chapters when incoming `seriesId` is set
- [x] #4 Drizzle migration backfills existing chapter rows: NULL content/cover/chapters and reset chapter_status='pending' so reader will refetch
- [x] #5 `pnpm check-types` passes in apps/capacitor and apps/web
- [x] #6 Server upsert UPDATE clause (not just INSERT) nulls content/cover/chapters when `excluded.series_id IS NOT NULL` — invariant survives even if migration is delayed
- [x] #7 Unit test in `apps/capacitor/src/services/sync/__tests__/book-to-sync.test.ts` asserts chapter rows never carry heavy fields
<!-- AC:END -->
