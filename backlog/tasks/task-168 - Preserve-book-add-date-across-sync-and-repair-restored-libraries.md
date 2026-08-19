---
id: TASK-168
title: Preserve book add date across sync and repair restored libraries
status: Done
assignee:
  - sch-28
created_date: '2026-08-19 20:17'
updated_date: '2026-08-19 20:47'
labels:
  - bug
  - sync
  - stats
dependencies: []
modified_files:
  - packages/core/src/sync.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/services/db/queries/books.ts
  - apps/capacitor/src/services/db/index.ts
  - apps/web/src/db/schema.ts
  - apps/web/src/routes/api/sync.ts
  - apps/web/src/lib/sync-book-upsert.ts
priority: high
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A book's `added_at` is device-local and never travels through sync. When a device pulls a library it has not seen before, `buildBookRowFromServer` stamps `addedAt: serverBook.updatedAt` — the source device's last position write. The restored library therefore reports an add date at or after the last time each book was read, so the book detail "Your journey" strip shows Added after Started, and often Added on the same day as Finished.

`backfillFinishedAt` compounds it: it stamps `finished_at = COALESCE(last_read, added_at)`, and a restored row has `last_read` null, so a bogus add date becomes a bogus finish date.

Observed on a real library (10 books, restored on a second device): `last_read` null on 8, `added_at == updated_at` on 9, `finished_at == added_at` on 7. Example: Hero of Ages has reading sessions from 2026-07-29 but claims it was added 2026-08-14.

Reading sessions do sync and carry true `started_at`, so the earliest session for a book is a sound lower bound for its add date and can repair existing libraries. Books with no sessions have no recoverable date and stay as they are.

Outcome: the add date survives a restore, and libraries already carrying wrong dates repair themselves on next launch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `addedAt` is part of the book sync payload and is optional, so a client or server row that pre-dates it still validates and still merges
- [x] #2 A library restored from the server shows each book's original add date rather than the pushing device's last-write timestamp
- [x] #3 When two devices disagree on a book's add date, the earliest wins, and the resolution is stable no matter which device pulls first
- [x] #4 A book whose stored add date is later than its earliest reading session is corrected to that session's start, on existing installs, without a reinstall
- [x] #5 A book with no reading sessions keeps its stored add date rather than being given an invented one
- [x] #6 The finished-date backfill no longer inherits a repaired (earlier) add date as a finish date for books that have reading sessions
- [x] #7 Unit tests cover the sync payload round-trip, the earliest-wins merge, and both backfills; server upsert merge is covered by an integration test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Protocol (packages/core/src/sync.ts)
1. `SyncBookSchema`: add `addedAt: z.number().int().nonnegative().nullable().optional()`. Same optionality rationale as `finishedAt` — absent means "this client has no such field", not "no add date".

## Capacitor (apps/capacitor)
2. `sync/index.ts` `bookToSync`: send `addedAt: book.addedAt`. Sent for tombstones too; an add date is not reader-written text.
3. `sync/index.ts` `buildBookRowFromServer`: `addedAt: serverBook.addedAt ?? serverBook.updatedAt`. Fallback keeps behaviour identical against a server row written by an older client.
4. `sync/index.ts` `buildBookMergeUpdate`: earliest-wins for `addedAt`, evaluated independently of the position and metadata gates (an add date is a fact, not a revision, so it is not gated on `updatedAt`). The function must return an update when the server's add date is strictly earlier even if neither existing gate fires. Idempotent and order-independent: min() converges whichever device pulls first.
5. `db/queries/books.ts`: new `backfillAddedAt()` — `added_at = MIN(added_at, earliest reading_sessions.started_at)` per book, only where a session exists and is earlier. Idempotent, fills only wrong-direction rows, invents nothing for books with no sessions.
6. `db/queries/books.ts` `backfillFinishedAt`: fallback becomes `COALESCE(last_read, MAX(session.ended_at), added_at)`. Without this, step 5 pulls `added_at` back to the first session and the finish fallback would date a finish to the day reading started. Book with no sessions is unaffected.
7. `db/index.ts`: run `backfillAddedAt()` before `backfillFinishedAt()` on startup, next to the existing call.

## Web (apps/web)
8. `db/schema.ts` `syncBooks`: `addedAt: timestamp("added_at")`, nullable (rows written before the column have no add date).
9. `drizzle/0020_book_added_at.sql` + meta journal via drizzle-kit generate.
10. `routes/api/sync.ts`: add `addedAt` to `metadataCols` and to the response mapping (`b.addedAt ? toMs(b.addedAt) : null`).
11. `lib/sync-book-upsert.ts`: `bookInsertValues` maps it to a `Date`; merge rule is earliest-wins across both upsert paths — `LEAST` over the two values, COALESCEd so a null on either side does not swallow the other.

## Tests
- `sync/__tests__/book-to-sync.test.ts`: payload carries `addedAt`.
- `sync/__tests__/book-merge.test.ts`: earlier server date wins, later one is ignored, absent one is a no-op, and no other column moves.
- `db/__tests__/stats-queries.test.ts` (or a books-queries sibling): both backfills, including the no-sessions case.
- `lib/sync-book-upsert.integration.test.ts`: server upsert keeps the earliest add date.

## Out of band
- Repair the user's connected Pixel directly (same SQL as step 5) rather than waiting for a rebuild. Force-stop app, back up the DB, patch a pulled copy, push it back, verify. Confirm before the push-back.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed against a real device DB (Pixel 8 Pro, `run-as` pull): `last_read` null on 8 of 10 books, `added_at == updated_at` on 9, `finished_at == added_at` on 7. Every wrong date traced to `buildBookRowFromServer` stamping `serverBook.updatedAt`.

The merge gate for `addedAt` deliberately sits outside the position and metadata gates. Both of those compare revisions; an add date is not one, so gating it on `updatedAt` would leave a device stuck with an inflated date until something unrelated changed.

`backfillFinishedAt` had to change alongside the new backfill rather than after it: its `added_at` fallback would otherwise inherit the repaired (earlier) date and report a finish on the day reading started. It now prefers the last session's `ended_at`, and keeps `added_at` as the last resort for a restored library whose sessions never arrived.

No server-side data backfill. Server rows converge on their own: clients push their repaired `added_at` on the next push, and the upsert takes the earliest.

`pnpm db:generate` could not be used — `drizzle/meta` only retains snapshots 0000-0002, so drizzle-kit diffs against a schema eight migrations stale and prompts interactively about `word_position`. Migration 0020 and its journal entry are hand-written, matching how 0003+ were done. Unrelated pre-existing issue, worth knowing before the next schema change.

Local dev DB `localhost/rsvp` is stale in the same way (still has `position`, not `word_position`), so the upsert integration tests cannot run against it. Verified instead on a scratch database built from the full migration chain, then dropped. Also added the `added_at` column to `rsvp` itself so the dev server keeps working.

Tests: 485 capacitor unit tests, 36 web tests including 12 upsert integration tests (3 new, against real Postgres). `pnpm turbo run check-types` clean across all 8 workspaces.

Post-implementation review by two fresh-context subagents (conventions/architecture, correctness/security). Applied: dropped the redundant double-COALESCE in the server `LEAST` (Postgres LEAST already ignores nulls, so the guard defended a case that cannot happen); removed a comment claiming the two startup backfills are order-dependent (they are not: `backfillAddedAt` only touches books that have sessions, `backfillFinishedAt` only reads `added_at` for books that have none); updated the `buildBookMergeUpdate` docstring from two gates to three and dropped the now-duplicated inline rationale; corrected the `journey.ts` comment that still quoted the old `COALESCE(lastRead, addedAt)` formula; passed the correlated subquery to `.set()` directly instead of re-wrapping an SQL in `sql``.

Real defect the review caught: the add date was a one-way ratchet with no floor. Every path moves it earlier only, and the server `LEAST` makes that permanent, so one sitting recorded before a device's clock had synced would pin the book to 1970 across every device with no way back. `backfillAddedAt` now ignores sessions before `EARLIEST_PLAUSIBLE_SESSION` (2025-01-01), covered by a new test. Deliberately not fixed by a Zod `.min()` on the field: a device holding a genuinely skewed `added_at` would then have its whole push rejected, which wedges sync entirely rather than degrading one date.

Declined: extracting the test fixture helpers shared with `stats-queries.test.ts` into `test-db.ts`. The duplication is real, but the two copies have already diverged in signature and consolidating them rewrites call sites in a file this task does not touch. Worth a follow-up if the helpers drift further.

Also declined: bounding `addedAt` above to stop `new Date(1e16)` throwing in drizzle's timestamp mapper and 500-ing a whole batched push. Real, but `updatedAt`, `finishedAt` and `metadataUpdatedAt` all have the identical unbounded shape today, so it is a pre-existing class of issue and the blast radius is the caller's own account.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

`added_at` never travelled through sync, so a device restoring a library stamped every book with `serverBook.updatedAt` — the pushing device's last position write. That lands at or after the last time each book was read, which is why the book detail journey strip showed Added after Started, and usually Added on the same day as Finished.

**Protocol** — `SyncBookSchema` gains an optional, nullable `addedAt`. Optional for the same reason as `finishedAt`: absent means the client has no such field, not that the book has no add date.

**Client** — `bookToSync` sends it, including on tombstones. `buildBookRowFromServer` reads it and falls back to `updatedAt` only when the server row pre-dates the field. `buildBookMergeUpdate` merges it earliest-wins, independently of the position and metadata gates, so a device holding a restore-inflated date recovers the original from one that still has it, whichever pulls first.

**Server** — new nullable `sync_books.added_at` (migration 0020) plumbed through the sync response and the push upsert. The upsert takes `LEAST` of stored and incoming, COALESCEd on both sides so a client that does not send the field leaves the stored value alone.

**Repair** — new `backfillAddedAt()` pulls an add date back to the book's earliest reading session when the stored date post-dates it. Sessions sync and carry true timestamps, so this repairs existing installs without a reinstall; a book with no sessions keeps its stored date rather than being given an invented one. `backfillFinishedAt()` now prefers the last session's `ended_at` over `added_at`, because the repaired add date would otherwise become a finish date on the day reading started.

## Tests

- `db/__tests__/books-backfill.test.ts` (new, real SQLite): both backfills, including idempotency, the no-sessions case, and the unfinished-book case.
- `sync/__tests__/book-merge.test.ts`: earliest-wins, later ignored, absent ignored, convergence, and that no revision stamp moves on its own.
- `sync/__tests__/book-to-sync.test.ts`: payload carries the date, tombstones included.
- `lib/sync-book-upsert.integration.test.ts`: three cases against real Postgres.

485 capacitor tests, 36 web tests, `check-types` clean across 8 workspaces.

## Risks and follow-ups

- The repaired date only propagates once clients run a build that sends `addedAt`; until then server rows keep a null add date and restores fall back to the old behaviour.
- `drizzle/meta` retains only snapshots 0000-0002, so `db:generate` is unusable and migration 0020 is hand-written. Worth fixing before the next schema change.
- The local dev database is several migrations stale (`position` vs `word_position`); integration tests were run against a scratch database instead.

## Review pass

Two fresh-context reviewers went over the diff. Six comment/DRY findings were applied, plus one real defect: the add date was a one-way ratchet with no floor, so a single reading session recorded before a device's clock had synced would have pinned the book to 1970 on every device permanently (the merge only moves the date earlier, and the server `LEAST` makes it stick). `backfillAddedAt` now ignores sessions from before 2025-01-01, with a test. Two findings were declined with reasons in the notes: consolidating test fixture helpers into a file this task does not touch, and an upper bound on `addedAt` that the three existing timestamp fields do not have either.

After the fixes: 486 capacitor tests, 36 web tests, `check-types` clean, Biome clean.
<!-- SECTION:FINAL_SUMMARY:END -->
