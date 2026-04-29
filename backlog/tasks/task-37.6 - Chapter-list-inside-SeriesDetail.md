---
id: TASK-37.6
title: Chapter list inside SeriesDetail
status: Done
assignee: []
created_date: '2026-04-26 15:29'
updated_date: '2026-04-26 20:59'
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
SeriesDetail currently shows metadata + Continue/Delete only. Add the chapter list as the seam below — uses `<DetailShell>`'s `children` slot, no shell changes.

## Component

`pages/library/series-chapter-list.tsx` — a list (or virtualized list, depending on chapter count; AO3 works of 2000+ chapters exist) that renders one row per chapter. Each row shows:

- Chapter index + title (e.g. "5. The Cellar")
- Per-chapter status indicator: read / unread / pending / locked / error
- Tap → `history.push('/tabs/reader/' + chapter.id)`

Read state inferred from `book.lastRead` and `book.position`:
- `lastRead === null` → unread
- `lastRead != null && position < size - 32` → in progress (% indicator?)
- `lastRead != null && position >= size - 32` → finished

Pending/locked/error are direct `chapterStatus` reads — same icons as the reader's `<ChapterStateOverlay>` but shrunk into a row glyph.

## Virtualization

For series with > 100 chapters, naive rendering tanks. Use the existing virtualization pattern from the reader's `ScrollView` if it generalizes, else `react-window`. Don't pull in a new dep without checking what the reader already uses.

## Wiring

In `series-detail.tsx`, render `<SeriesChapterList seriesId={series.id} />` as a `<DetailShell>` `children` slot. Existing data hook `getSeriesChapters(seriesId)` already returns ordered chapter rows.

Pair with the polling task (TASK-37.5) — when polling adds new chapters, the list automatically picks them up via React Query invalidation.

## Out of scope

- Read/unread bulk actions (mark series as read, mark chapter as unread) — separate future task.
- Sorting the list (newest first / oldest first) — default is `chapterIndex ASC` (story order); reverse-chrono can be a v2 toggle.

## Verification

1. `pnpm check-types` clean.
2. Manual: import a multi-chapter series → SeriesDetail → chapter list renders below the action buttons → scroll through, tap any chapter → reader opens at that chapter.
3. Read a chapter → return to SeriesDetail → that row shows "read" indicator.
4. Visual check: 2000-chapter series doesn't lag.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `<SeriesChapterList />` component rendered as `<DetailShell>` children in SeriesDetail
- [x] #2 Per-chapter row shows index, title, status indicator
- [x] #3 Tap routes to `/tabs/reader/:chapterId`
- [x] #4 Read/unread/in-progress/pending/locked/error states all surface
- [x] #5 Virtualized rendering for series with > 100 chapters
- [x] #6 `pnpm check-types` clean
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
All code written and reviewed. `SeriesChapterList` component renders below action buttons in `<DetailShell>` children slot using `VList` for virtualization. Per-chapter rows show index, title, and state glyph (unread/in-progress/finished/pending/locked/error). Tap routes to `/tabs/reader/:chapterId`. `readingProgress` reused from `sort-filter.ts`. `handleTap` wrapped in `useCallback`. `seriesId` threaded through mutation variables in `chapter-fetch.ts`. 113/113 unit tests pass, `pnpm check-types` clean.
<!-- SECTION:FINAL_SUMMARY:END -->
