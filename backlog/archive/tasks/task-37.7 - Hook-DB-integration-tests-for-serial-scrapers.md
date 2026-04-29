---
id: TASK-37.7
title: Hook + DB integration tests for serial-scrapers
status: To Do
assignee: []
created_date: '2026-04-26 15:30'
updated_date: '2026-04-26 18:06'
labels: []
milestone: m-4
dependencies: []
documentation:
  - doc-1
parent_task_id: TASK-37
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The current test suite covers pure helpers + adapter parsing + registry fan-out. Two layers stayed deliberately out-of-scope and are now worth filling in:

## React-Query hook tests

Setup: install `@testing-library/react` + a small `<TestQueryProvider>` wrapper. Add tests for:

- `useSearchSerials(query, opts)` — debounce timing (typing 5 keystrokes in 100ms emits 1 upstream call), `staleTime: 5min` cache hit on retype, `retry: false` (mocked rejection doesn't retry).
- `useChapterFetch(book)` — StrictMode double-effect doesn't double-fire `mutate` (the existing `inflightRef` guard); `pending → fetched` transitions invalidate `bookKeys.detail/content`.
- `useChapterAutoAdvance(book)` — re-entrancy guard (calling `tryAdvance` twice synchronously fires only one navigation).
- `useImportSerialFromUrl` — invalidates both `bookKeys.all` AND `serialKeys.all` on success (regression check for the bug we just fixed).

## DB-touching tests for queries

Setup: in-memory SQLite via `sql.js` + drizzle-orm/sql.js adapter. Run migrations once per test file, reset between tests via `withTransaction(rollback)`.

- `getSeriesChapterCounts()` — returns correct counts; doesn't include tombstoned chapter rows.
- `addSeriesWithChapters()` — series row + N chapter rows + N empty content rows all present after; partial failure (force one insert to throw) leaves no orphan rows.
- `getSeriesEntryChapter()` — returns last-read chapter when one exists, else chapter 0.
- `getNextChapter()` — finds chapter N+1; returns undefined for the last chapter.
- `deleteSeries()` — series + all chapter rows tombstoned (`deleted=true`).

## Why these stayed out of scope until now

Both need test infra that didn't exist (react-testing-library + a SQLite test fixture). With the foundation feature-complete, the cost of adding these is small and pays back every time someone refactors a hook or query.

## Out of scope (still)

- E2E tests (Playwright on the web build, native via Maestro on Android) — these are end-to-end flows and a separate concern.

## Verification

1. New tests under `__tests__/hooks/` and `__tests__/queries/`.
2. `pnpm test` runs all three tiers + the new two; total wall clock < 5s.
3. Deliberately re-introduce the missed `serialKeys.all` invalidation bug → the regression test for `useImportSerialFromUrl` fails. Revert.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `@testing-library/react` + a `<TestQueryProvider>` wrapper available for hook tests
- [ ] #2 `sql.js` + drizzle test adapter available for DB tests; migrations applied once per file
- [ ] #3 Hook tests for useSearchSerials / useChapterFetch / useChapterAutoAdvance / useImportSerialFromUrl
- [ ] #4 DB tests for getSeriesChapterCounts / addSeriesWithChapters / getSeriesEntryChapter / getNextChapter / deleteSeries
- [ ] #5 Total test suite still under 5s wall clock
- [ ] #6 Deliberate-break verification confirms each new test catches its regression
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Archived (canceled). The rest of the app has no hook tests or DB-integration tests, and adding them only for serials would create a maintenance island. The layers that break in practice — provider HTML parsing — are already covered by adapter unit tests + live smokes; hooks and queries are thin wrappers and rarely break in isolation. Re-open if/when project-wide hook/DB testing is introduced.
<!-- SECTION:FINAL_SUMMARY:END -->
