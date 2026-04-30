---
id: TASK-37.5
title: Update-on-open polling for series
status: Done
assignee: []
created_date: '2026-04-26 15:29'
updated_date: '2026-04-26 21:32'
labels: []
milestone: m-4
dependencies: []
documentation:
  - doc-1
parent_task_id: TASK-37
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the user opens a series (tap card → SeriesDetail, OR tap into reader), refresh the chapter list against upstream so newly-published chapters appear without manual action. Stale-while-revalidate: existing chapters render immediately; new chapter rows pop in when the poll settles.

## Where the logic lives

`SeriesDetail` is the natural home — it already opens on series tap and has the series id + provider. Add a small `useChapterListSync(seriesId)` hook that:

1. On mount with the series id, calls `scraper.fetchChapterList(series.tocUrl)`.
2. Diffs the result against existing chapter rows by `chapterSourceUrl` (the stable identity key).
3. For new entries: inserts a chapter book row with `chapter_status='pending'`.
4. For reordered entries: updates `chapter_index` to match the new TOC.
5. Updates `series.lastCheckedAt`.

Don't block initial render on the poll — show existing chapters immediately, append new ones when ready.

## Schema

`series.lastCheckedAt` already exists. `book.chapterSourceUrl` is the stable identity key per the original design — already in the schema. No migration needed.

## Pipeline + commit

Add `pollChapterList(seriesId)` to `serial-scrapers/pipeline.ts`. Sole caller of a new `commit.ts:syncChapterList(seriesId, refs)` that wraps the diff + inserts. New chapter rows go through `addBookWithContent` (pending content = empty string). Sync push fires after.

## Throttle

Each `fetchChapterList` already runs through `utils/throttle.ts`. Polling on every open means a series the user revisits 10x in a session triggers 10 polls — fine, throttle gates them. Optional debounce: skip polling if `series.lastCheckedAt` is < 60s ago. **Ship without** the debounce; add only if poll cost becomes noticeable.

## UI feedback

- Subtle indicator on SeriesDetail: a small "Checking for new chapters…" line that appears during the poll and disappears on settle.
- After a successful poll that found new chapters: toast "N new chapters" or update the chapter-count badge silently. (Recommend silent — too chatty otherwise.)

## Out of scope (follow-ups)

- Background polling (when the app is closed) — needs platform notification setup. Doc-1 explicitly says "no background polling, no notifications (yet)".
- Polling on tap of the series card (without opening detail) — only triggers on detail-open for now.

## Verification

1. `pnpm check-types` clean.
2. Manual: import an AO3 series. Mock the network to prepend a new chapter to the TOC response. Reopen SeriesDetail → new chapter appears in the list with `pending` status; tap to fetch.
3. Manual: import a series, delete one chapter from the TOC upstream. Reopen → existing chapter row stays (we don't aggressively delete user data — flag this as a deliberate trade-off in code comment; user explicitly deleting a chapter via UI is a separate flow).
4. Multi-device sync: device A polls and inserts new chapter rows; device B pulls the sync payload and shows them. Already wired via existing book sync.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `useChapterListSync(seriesId)` hook polls on SeriesDetail mount
- [x] #2 `pollChapterList(seriesId)` in `pipeline.ts` is the only caller of `syncChapterList(seriesId, refs)` in `commit.ts`
- [x] #3 New chapter rows insert with `chapter_status='pending'`
- [x] #4 `series.lastCheckedAt` updates after each poll
- [x] #5 Existing chapter rows preserved even if upstream removed them (deliberate)
- [x] #6 Subtle in-progress indicator on SeriesDetail during poll
- [x] #7 `pnpm check-types` clean
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
All code written and tests passing. Key pieces:

- `queries/series.ts`: `insertChapters(rows)` — batched books + book_content INSERT (idempotent via onConflictDoNothing); `updateChapterIndex(bookId, newIndex)` — reorder support.
- `commit.ts`: `syncChapterList(seriesId, refs)` — diffs upstream refs against existing rows by chapterSourceUrl; inserts new pending rows; updates reordered indices; updates lastCheckedAt; calls scheduleSyncPush only when new rows added; never deletes existing rows.
- `pipeline.ts`: `pollChapterList(seriesId)` — loads series, resolves scraper by provider, calls fetchChapterList (throttled inside each scraper), delegates to syncChapterList.
- `use-series.ts`: `useChapterListSync(seriesId?)` — useEffect fires on mount, calls pollChapterList, invalidates serialKeys.chapters + serialKeys.counts on success, silent on error. hasFired ref prevents double-poll in React Strict Mode.
- `series-detail.tsx`: wired useChapterListSync; renders subtle "Checking for new chapters…" text while isSyncing.
- Tests: 13 new unit tests (sync-chapter-list.test.ts x10 + poll-chapter-list.test.ts x4). 126/126 total, pnpm check-types clean.
<!-- SECTION:FINAL_SUMMARY:END -->
