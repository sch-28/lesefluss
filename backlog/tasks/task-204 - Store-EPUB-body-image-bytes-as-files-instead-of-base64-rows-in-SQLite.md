---
id: TASK-204
title: >-
  Web build: store EPUB body image bytes outside SQLite (measure after TASK-203
  first)
status: To Do
assignee: []
created_date: '2026-10-20 21:57'
updated_date: '2026-10-20 22:05'
labels:
  - storage
  - performance
  - images
  - web
  - pwa
milestone: m-14
dependencies:
  - TASK-203
references:
  - apps/capacitor/src/services/db/schema.ts
  - apps/capacitor/src/services/db/queries/books.ts
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/services/book-import/repair-images.ts
  - apps/capacitor/src/services/book-import/upgrade-images.ts
  - TASK-177
  - TASK-203
priority: low
ordinal: 165000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why
EPUB body images are stored in `book_images.data` as base64 text (`apps/capacitor/src/services/db/schema.ts`). Even after TASK-177.3 downscaling, an illustrated book is about 20 MB of base64 against about 1.4 MB of text, so for illustrated libraries images are most of the database. Base64 adds about 33% over the raw bytes, and every image read crosses the bridge or `postMessage` as a large string.

Where it matters:
- **Web / iOS PWA (TASK-121):** today the whole database is held in memory and re-exported on every write. TASK-203 fixes that, so after TASK-203 the remaining gain is OPFS quota (iOS allows up to ~60% of disk, shared with everything else) and cheaper reads. **Measure an illustrated library after TASK-203 lands and only do this task if the numbers justify it.**
- **Android:** the gain is about 25% of image data per illustrated book plus bridge marshalling. Not worth migrations and orphan handling on its own; out of scope unless the web work makes it nearly free.

## Target (web build)
Keep image metadata (`book_id`, `key`, `mime`, `width`, `height`, `is_line_art`) in SQLite and store raw bytes as files in an OPFS directory next to, not inside, the directory owned by TASK-203's `opfs-sahpool` VFS. iOS Safari before 26 has no `createWritable`, so writes need `createSyncAccessHandle` in a worker (the TASK-203 database worker is the natural place). `@capacitor/filesystem` on web writes to IndexedDB, not OPFS, so do not use it for this. Alternative worth comparing in the measurement step: a raw BLOB column, if the web driver passes `Uint8Array` through cheaply (keeps a single store, no orphan handling, but the schema is shared with native).

## Context the implementer needs
- **Writers.** All writes go through `storeBookImages` / `addBookImages` (`services/book-import/store-images.ts`, `services/db/queries/books.ts`): the import commit (`commit.ts`), attach-original (TASK-177.9, `attach-original.ts`), and on native also repair and upgrade-on-open (`repair-images.ts`, `upgrade-images.ts`, native-only because web never keeps the original EPUB). Keep the existing per-image "book was deleted, stop writing" check; a file written for a tombstoned book is an orphan.
- **Readers.** `getBookImages` (metadata) and `getBookImageData` (`queries/books.ts`), consumed via `useBookImageData` (`hooks/use-books.ts`), which caches data URLs with a 60 s `gcTime`. Object URLs need `URL.revokeObjectURL` when the query is collected or the reader unmounts, or they leak.
- **Deleters.** `deleteBook` (reached via `removeBook` in `commit.ts`, used by single delete, bulk delete and the danger zone) and `hardDeleteBook`, which sync pull calls on a server tombstone (`services/sync/index.ts`). Both must remove image files. Wipe-all-data (`services/db/index.ts`) must clear the image directory too. Orphaned files from a crash between row delete and file delete must be cleaned up later.
- **Existing note:** `hardDeleteBook` already leaks the original EPUB file on native today; fix that while touching it.
- **Migration.** Move existing base64 rows out once, in the background and resumably, without blocking startup. SQLite does not shrink after clearing a column, so run `VACUUM` afterwards or the database stays the same size.
- Images are device-local and never synced (`bookToSync` leaves them out), so the server schema is unaffected.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Before starting: database size, image share and image read time for an illustrated test library on the TASK-203 web build are recorded in the task notes, with a go/no-go decision
- [ ] #2 New web imports and attach-original store image bytes as raw files in OPFS and only metadata in book_images
- [ ] #3 Existing base64 rows on web are migrated once in the background, resumably, without blocking startup, followed by VACUUM; size before and after is recorded
- [ ] #4 removeBook, sync-pull hardDeleteBook and wipe-all-data remove image files; orphaned files are cleaned up
- [ ] #5 Object URLs are revoked when no longer used (no growth in a long reading session)
- [ ] #6 Reader renders images in scroll and page mode as before on web; Android is unchanged
- [ ] #7 Unit tests cover the storage module and migration; pnpm e2e, pnpm e2e:app and capacitor check-types are green
<!-- AC:END -->
