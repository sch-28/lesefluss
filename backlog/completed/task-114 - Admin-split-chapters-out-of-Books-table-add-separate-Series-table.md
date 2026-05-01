---
id: TASK-114
title: 'Admin: split chapters out of Books table, add separate Series table'
status: Done
assignee: []
created_date: '2026-04-30 21:52'
updated_date: '2026-04-30 22:26'
labels:
  - admin
  - web
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The web admin (`/admin`) currently shows every `sync_books` row in a single "All Books" table, including chapter rows that belong to a serial (`series_id` set). With long web-novels this floods the table with hundreds of "chapter"-tagged entries that look like books, which is confusing.

Plan: stop listing chapter rows in the books table and add a parallel "All Series" table sourced from `sync_series`, with chapter count and aggregate size per series.

## Files
- `apps/web/src/lib/admin.ts` — server fns (`getAdminBooks`, new `getAdminSeries`, new `deleteAdminSeries`, `getAdminStats` adjustments)
- `apps/web/src/routes/_authenticated/admin/index.tsx` — `BooksTable` filter, new `SeriesTable`, page layout

## Notes
- Tombstone counts shown in the books filter must match the new (standalone-only) row set, so the per-user/global tombstone aggregates in `getAdminStats` need a `series_id IS NULL` filter as well.
- Series soft-delete must cascade chapter tombstones, mirroring the cascade in `apps/web/src/routes/api/sync.ts:337-348`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `getAdminBooks` returns only standalone books (`series_id IS NULL`); chapter rows no longer appear in the admin Books table
- [x] #2 New `getAdminSeries` server fn returns each series with chapter count, aggregate non-deleted chapter file size, user email, and tombstone flag
- [x] #3 Admin page renders a new "All Series" section between Books and Catalog with title/author/user/chapters/size/updated columns and per-row delete
- [x] #4 Deleting a series soft-deletes the `sync_series` row and cascade-tombstones all its chapter rows in `sync_books` (matches sync.ts cascade behavior)
- [x] #5 `getAdminStats` book/tombstone counts exclude chapter rows so the in-table tombstone toggle label stays consistent with the visible rows
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Changes

### `apps/web/src/lib/admin.ts`
- `getAdminBooks` now filters `series_id IS NULL` so chapter rows never reach the admin Books table.
- New `getAdminSeries` returns one row per non-deleted `sync_series`, joined with the user email and aggregated against `sync_books` for chapter count and total chapter size.
- New `deleteAdminSeries` soft-deletes the series row and cascade-tombstones every live chapter row, mirroring the cascade in `routes/api/sync.ts`.
- `getAdminStats` book/tombstone aggregates are scoped to standalone books so the tombstone toggle label and the cleanup button stay consistent with the visible rows. Added `seriesTotal`. Storage still sums every non-deleted row since chapters consume real bytes.
- `hardDeleteAdminTombstones` now hard-deletes only standalone tombstones — chapter tombstones are owned by their parent series.

### `apps/web/src/routes/_authenticated/admin/index.tsx`
- New `SeriesTable` (title + provider badge, user, chapter count, aggregate size, updated, delete) wired to `getAdminSeries` / `deleteAdminSeries`. Mutations invalidate the books, series, and stats keys so the BooksTable refreshes when chapters cascade.
- New "All Series" section between Books and Catalog.
- Added a Series stat card next to Books.
- Removed the now-unreachable "chapter" badge from the BooksTable title cell.

## Follow-up
- No UI to clean up chapter or series tombstones yet — chapter tombstones from cascade and series tombstones from `deleteAdminSeries` accumulate. Add a series-side cleanup button if/when this becomes a storage concern.

## Review-driven follow-ups (TASK-114)

### admin.ts
- Hoisted `standaloneBookOnly = isNull(syncBooks.seriesId)` to module scope; both stats and cleanup share the predicate.
- `getAdminBooks` no longer selects the always-null `seriesId`; `getAdminSeries` no longer selects the unused `sourceUrl`.
- `chapterAggregates` filter rewritten as a plain loop, dropping the `(a): a is typeof a & {...}` predicate.
- `getAdminStats` now also returns `seriesTombstoneTotal` and `seriesTombstonesByUser`.
- New `hardDeleteAdminSeriesTombstones` hard-deletes tombstoned `sync_series` rows plus their chapter tombstones in a single transaction.
- Em-dashes purged from new comments per AI guidelines.

### admin/index.tsx
- New shared primitives: `TableShell<T>` (header/body/expand/pagination), `DeleteAction` (confirm/cancel cell), `TombstoneToolbar` (filter + tombstone toggle + cleanup buttons), `useTombstoneState<TResult>` (filter/tombstone/cleanup state owner). All three tables (Users, Books, Series) now compose these instead of duplicating ~150 lines of layout and state each.
- SeriesTable picked up filter-by-user, show-tombstones toggle with count, and a Cleanup button driven by the new server fn.
- Tombstone state: pre-existing in BooksTable, now factored out and reused by SeriesTable. Cleanup result type is generic so each table prints its own post-cleanup notice.

## Second review pass

### admin.ts
- `deleteAdminUser` now also hard-deletes the user's `sync_series` rows in the same transaction; previously these were left orphaned.
- `getAdminUsers.bookCount` filters to standalone books so the Users-table 'Books' column matches the meaning of the All-Books table (chapters were inflating the count).

### admin/index.tsx
- Renamed `type ReactTable<T>` to `TableInstance<T>` (avoid shadowing the lib name).
- `useTombstoneState`: `cleanup` and `onInvalidate` are now ref-stabilized internally so parents can pass inline arrows without invalidating `handleCleanup` every render. `cleanupController` wrapped in `useMemo`.
- New `useConfirmDelete<TArgs>` hook owns confirming/isPending state, `stateRef`, and `handleDeleteRef`. Return value is memoized so consumers can use the hook result as a `useMemo` dep without churn. UsersTable, BooksTable, and SeriesTable now compose it (eliminates ~15 lines × 3 of duplicated state and ref plumbing per table). Tables that need an `expanded` ref keep it locally as `expandedRef`.
- `UsersTable` delete now also invalidates the `series` key (a deleted user's series rows go away alongside their books).
<!-- SECTION:FINAL_SUMMARY:END -->
