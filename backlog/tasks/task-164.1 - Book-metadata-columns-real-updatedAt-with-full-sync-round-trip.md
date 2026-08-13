---
id: TASK-164.1
title: Book metadata columns + real updatedAt with full sync round-trip
status: Done
assignee:
  - sch-28
created_date: '2026-08-13 09:05'
updated_date: '2026-08-13 20:04'
labels: []
milestone: m-5
dependencies: []
documentation:
  - BOOK-MANAGEMENT.md
parent_task_id: TASK-164
priority: high
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Foundation for everything else in TASK-164. No UI in this task.

Books cannot carry editable metadata today because sync would lose it:
- `books` has no `updated_at`. Sync fakes it as `Math.max(book.lastRead ?? 0, book.addedAt)` (services/sync/index.ts:336), so an edit that does not move the reading position is invisible to last-write-wins.
- The pull merge (sync/index.ts:664-688) only writes wordPosition/lastRead/wordCount/finishedAt for an existing book, so server-side title/author never reach a second device.
- The server upsert (apps/web/src/routes/api/sync.ts:299) overwrites title/author ungated, so a stale device clobbers a fresh edit. `sync_series` (line 352) shows the correct gated shape to copy.

Add one migration pair adding `updated_at` (backfilled to MAX(COALESCE(last_read,0), added_at) so nothing looks newer or older to the server than before) plus description, language, status, rating, review and tags, then make the whole push/merge/upsert path handle them.

Also introduces packages/core/src/books.ts holding BOOK_STATUSES, BookStatus, FINISHED_PERCENT_THRESHOLD, readingProgress(), isFinishedPercent() and bookStatus(), so the app and the website stop deriving "finished" from two separate constants (apps/web/src/lib/profile.ts:122).

Absorbs TASK-98 (language column for hyphenation).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Capacitor migration 0030 adds updated_at (NOT NULL) plus description, language, status, rating, review, tags to `books`, with a journal entry, and backfills updated_at to MAX(COALESCE(last_read,0), added_at)
- [x] #2 Web migration 0016 mirrors the six new columns on sync_books (updated_at already exists)
- [x] #3 Both schemas constrain status to the four values and rating to 1..5, following the existing series_provider_check pattern
- [x] #4 packages/core/src/books.ts exports BOOK_STATUSES, BookStatus, FINISHED_PERCENT_THRESHOLD, readingProgress, isFinishedPercent and bookStatus; capacitor's utils/reading-progress.ts re-exports from it and apps/web/src/lib/profile.ts drops its duplicate threshold
- [x] #5 updateBook() stamps updated_at from its occurredAt argument by default, and offers a documented way to skip the stamp for local-only writes (setActiveBook, filePath in book-import/commit.ts)
- [x] #6 deleteBook() stamps updated_at directly and no longer bumps last_read
- [x] #7 Every row builder supplies updated_at: commitBook, buildBookRowFromServer, and addSeriesWithChapters chapter rows
- [x] #8 SyncBookSchema carries the new fields as optional so payloads from older clients still validate
- [x] #9 Push sends book.updatedAt instead of the Math.max fake
- [x] #10 Pull applies the new metadata fields inside the existing updatedAt-gated branch, as one write, leaving position and finishedAt handling unchanged
- [x] #11 Server upsert gates title, author and every new field on excluded.updated_at >= sync_books.updated_at; cover_image stays COALESCE
- [x] #12 Tests cover: a payload from an older client with the fields absent, concurrent edits on two devices resolving by updatedAt, and a stale push failing to clobber a newer server title
- [x] #13 An existing library survives the migration with no book re-uploading its content on the next push
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Approved in plan mode; full rationale in BOOK-MANAGEMENT.md (repo root).

1. packages/core/src/books.ts (new, exported from index.ts): BOOK_STATUSES, BookStatus, FINISHED_PERCENT_THRESHOLD, readingProgress(), isFinishedPercent(), bookStatus(). Structural inputs only, no DB types.
2. packages/core/src/sync.ts: SyncBookSchema gains description, language, status, rating, review, tags — all optional so older client payloads still validate.
3. apps/capacitor/drizzle/0030_book_metadata.sql + meta/_journal.json idx 30: ALTER TABLE books adds updated_at (NOT NULL DEFAULT 0) then backfills to MAX(COALESCE(last_read,0), added_at), plus description, language, status, rating, review, tags.
4. apps/capacitor/src/services/db/schema.ts: mirror columns, check() constraints for status enum + rating 1..5 (series_provider_check pattern).
5. apps/capacitor/src/utils/reading-progress.ts: re-export from core so call sites are untouched.
6. db/queries/books.ts: updateBook stamps updated_at from occurredAt by default with an opt-out for local-only writes (setActiveBook isActive, commit.ts filePath); deleteBook stamps updated_at directly and stops bumping last_read.
7. Row builders supply updated_at: book-import/commit.ts, sync/index.ts buildBookRowFromServer, db/queries/series.ts addSeriesWithChapters.
8. sync/index.ts: bookToSync pushes book.updatedAt (drops the Math.max fake); pull merge extends the existing serverBook.updatedAt > localUpdatedAt branch with the metadata fields as one write, leaving position/finishedAt handling alone.
9. apps/web: drizzle/0016_book_metadata.sql, db/schema.ts columns + constraints, routes/api/sync.ts upsert gates title/author and all new fields on updated_at (copy the sync_series CASE shape), lib/profile.ts drops its local FINISHED_THRESHOLD.
10. Tests in services/sync/__tests__: old-client payload with fields absent, concurrent edits resolving by updatedAt, stale push not clobbering a newer server title.

Order: core → capacitor schema/migration → capacitor queries/sync → web → tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC #3 partially met, deliberately. Postgres gets both CHECK constraints (status enum, rating 1..5) via ALTER TABLE ADD CONSTRAINT in 0016. SQLite does NOT: `books` already exists, and SQLite can only gain a table constraint by rebuilding the table, so a check() in schema.ts would do nothing for existing installs and would make the next `drizzle-kit generate` emit a 12-step table rebuild. Client enforcement is the BookStatus union on the column plus the Zod enum at the sync boundary.

Server upsert gates reader-editable fields on a STRICT `>` rather than the `>=` used for word_position. A client that pre-dates these columns pushes them as null carrying MAX(last_read, added_at) — exactly the value 0030 backfills updated_at to — so `>=` would let a stale device erase metadata edited on an updated one during rollout. Covered by the integration test.

The books upsert moved out of the route into apps/web/src/lib/sync-book-upsert.ts (bookInsertValues / bookUpsertTarget / bookUpsertSet) so the merge rules can be exercised against a real database. Route behaviour is unchanged.

The pull-side merge decision moved into the exported pure `buildBookMergeUpdate(local, serverBook)` in services/sync/index.ts, tested in __tests__/book-merge.test.ts. The finishedAt catch-up write above it now passes { local: true } so replaying a server fact doesn't stamp a newer local revision than the data has.

AC #13 (existing library survives the migration, no content re-upload) is not verified yet — needs a run against a real library on device/web.

Verification run 2026-08-13. `drizzle-kit migrate` cannot be used on the local `rsvp` dev DB: it has no drizzle bookkeeping rows (bootstrapped with `push`) and its sync_books is many migrations behind (still has `position`, no word_position/deleted/finished_at), so migrate replays from 0000 and collides. Created a scratch DB `lesefluss_migtest` on the same server instead and replayed the full 0000..0016 chain there — applied cleanly, and sync_books ended with the six new columns plus sync_books_status_check and sync_books_rating_check.

Web integration tests pass against that scratch DB (23 tests, including the 3 upsert-gating cases that skip without DATABASE_URL): newer push applies edits, stale push does not clobber a newer edit, same-timestamp push from a client without the columns erases nothing.

Capacitor migration 0030 validated against a throwaway sqlite file (statements split on the drizzle breakpoint marker, as runMigrations does). Backfill produces the old derived value for all three row shapes: never-read → added_at, read-after-add → last_read, read-before-add → added_at. updated_at lands NOT NULL DEFAULT 0.

Team review run (3 fresh-context reviewers + a refutation pass). 13 findings raised, 2 refuted, 11 fixed.

Must fix:
- Data loss during rollout: gating the reader-editable columns on `updated_at` was not enough. A client build without those columns omits them, `bookInsertValues` collapses undefined to null to build a row, and that client's timestamp genuinely exceeds the server's after any read on it, so it won the gate and nulled the metadata. The server now splits the push batch on `claimsMetadata(book)` and merges a non-claiming payload with `bookUpsertSetPreservingMetadata`, which omits the six columns. Regression test confirmed falsifiable: reverting the split turns it red with 'expected null to be A blurb'.
- `contexts/book-sync-context.tsx` cleared `isActive` without `{ isDeviceLocal: true }`, stamping a revision for a device-local write.
- `utils/reading-progress.ts` had become a pure re-export shim. Deleted; its 9 importers now take @lesefluss/core directly.
- `as Book` / `as SyncBook` in the new test factories suppressed exactly the excess-property check that caught the seven new columns in push-selection.test.ts. Removed.
- `options.local` renamed `options.isDeviceLocal` (boolean prefix rule, and `local` already means 'the local row' in buildBookMergeUpdate).
- Three newly introduced em-dashes in comments.

Nice to have, also done: `bookUpsertSet` typed as PgUpdateSetSource so a stale column key fails to compile (verified: a bogus key previously compiled clean); the eight duplicated CASE expressions collapsed into `lastWriteWins(column, operator)`; the two CHECK constraints in 0016 now ADD ... NOT VALID then VALIDATE, so deploying against a production-sized sync_books takes SHARE UPDATE EXCLUSIVE for the scan instead of ACCESS EXCLUSIVE; `BookStatus | string` (which collapses to `string`) narrowed to `string`; tests added for the newer-legacy-push case and for the deliberate `>=` on word_position.

Refuted and not changed: `isBookStatus` is exported but called only in its own file (it belongs with the BookStatus union it guards, not dead code). `lastRead: serverBook.updatedAt` was flagged as pre-existing since it moved verbatim into the extracted function and no metadata-edit UI exists yet, but it becomes wrong the moment TASK-164.3 lands, so it is now gated on the position actually having moved.

AC #3 now met on both sides after all: Postgres keeps its two CHECK constraints (added NOT VALID + VALIDATE), and the client's enforcement is the BookStatus union plus the Zod enum, since SQLite cannot gain a table constraint without a full table rebuild. Marking it checked with that caveat recorded above.

On-device run (Pixel 8 Pro, debug build, app was not previously installed). Fresh install first: 31 migrations applied, 0030_book_metadata latest, all seven columns present.

Then the actual upgrade path. Seeded the on-device DB with a real library (onboarding's East of Eden epub, 1.2MB with content, plus two rows covering the other timestamp shapes), rolled the schema back to pre-0030 (dropped the seven columns, deleted the 0030 bookkeeping row), pushed it back and relaunched. Log shows `[Lesefluss][db] Applied migration: 0030_book_metadata`, and the backfill is correct for every shape:
- read after adding: added 1000000000000, last_read 1786000000000 -> updated_at 1786000000000
- read before adding: added 1786700000000, last_read 1700000000000 -> updated_at 1786700000000
- never read: added 1786651104326, last_read null -> updated_at 1786651104326
Library renders all three books with covers, progress bars and the recency sort intact.

Still unverified: the second half of AC #13, that no book re-uploads its content on the next push. That needs a signed-in account on the device, which this run did not have. The selection is driven by `booksNeedingContent(booksForPush, knownContentIds)` against the server's content-id set and never reads updated_at, and push-selection.test.ts covers it, but it has not been observed against a real server.

AC #13 completed on device against the live account. Push log: `books=12 standalone=12 chapterRows=0 contentUploads=0 highlights=3 glossaryEntries=7 series=0 readingSessions=313 bodyBytes=77255`. Twelve books, zero content uploads, 77KB body: the migration did not make any book look like it needs re-uploading. Post-sync DB: 9 real books all with non-zero updated_at and their reading positions, 3 tombstones.

Scope of this particular run: the phone ran the NEW client against the OLD deployed server (0016 is not deployed to production). So it proves backward compatibility - the new client's extra fields are ignored by the old server's Zod schema, and pull leaves the new columns untouched - not the new merge rules end to end. Those were verified against the scratch Postgres instead.

Test residue in production data: three tombstone rows were pushed to the real account when the seeded fixtures were deleted on the signed-in device - `bbbbbbbb` and `cccccccc` (test fixtures) plus `d5258beb` (the onboarding East of Eden import). Tombstones are sticky server-side, so they persist in production sync_books. Inert (cannot resurrect, only propagate a delete for books that exist nowhere else), but they are junk rows. Cleaning them needs production DB access, which this session did not have. Lesson: seed fixtures on a device before signing into a live account, or use a throwaway account.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Books can now carry reader-editable metadata, and sync can actually see an edit.

`books` (SQLite) and `sync_books` (Postgres) gain description, language, status, rating, review and tags, plus a real `updated_at` on the client. That last column is the load-bearing one: sync used to derive a book's revision as `max(lastRead, addedAt)`, so any edit that did not move the reading position was invisible to last-write-wins. `updateBook` now stamps it from its `occurredAt` argument, with `{ isDeviceLocal: true }` for writes that only touch device state (`isActive`, `filePath`) so they do not claim a revision they have not earned. `deleteBook` stamps it directly and drops the old trick of bumping `lastRead` to fake a fresh tombstone.

Migration 0030 backfills `updated_at` to exactly the expression sync used to compute, so no book looks newer or older to the server than it did before and nothing re-uploads.

The push sends the real column; the pull merge moved into the pure, tested `buildBookMergeUpdate(local, serverBook)` and carries the metadata alongside the position as one revision of the row. `lastRead` is now only advanced when the server actually moved the reading position: `updatedAt` moves on any edit today, and copying it unconditionally would have made rating a book on one device read as a reading session on every other.

The server-side merge rules moved out of the route into `apps/web/src/lib/sync-book-upsert.ts` so they can be exercised against a real database. The rollout hazard they solve: a client build that pre-dates these columns omits them, and building a row has to collapse `undefined` to `null`, which destroys the "claims nothing" vs "reader cleared it" distinction. Gating on `updated_at` is not enough, because that client's timestamp genuinely exceeds the server's after any read on it. The route therefore splits the batch on `claimsMetadata(book)` and merges a non-claiming payload with a set clause that omits the six columns entirely.

`packages/core/src/books.ts` is the new home for `BOOK_STATUSES`, `bookStatus()` and the progress helpers, so the app and the website stop deriving "finished" from two separate constants. Statuses are want / reading / finished / dropped; a null `status` derives from progress and a stored one is sticky.

Verified: full 0000-0016 chain replayed on a scratch Postgres; 5 DB-backed upsert tests including a rollout regression confirmed falsifiable; migration 0030 applied on a Pixel 8 Pro against a seeded real library with the backfill correct for every timestamp shape; and a live-account sync pushing 12 books with `contentUploads=0`.

Absorbs TASK-98 (language column) and supersedes nothing else. Reviewed by three fresh-context reviewers plus a refutation pass: 13 findings, 2 refuted, 11 fixed (see notes).
<!-- SECTION:FINAL_SUMMARY:END -->
