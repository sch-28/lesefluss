---
id: TASK-46.4
title: Per-book stats card on book detail page
status: To Do
assignee: []
created_date: '2026-04-30 23:30'
updated_date: '2026-04-30 23:31'
labels: []
milestone: m-5
dependencies:
  - TASK-46.1
parent_task_id: TASK-46
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Small stats block on the book detail page (`apps/capacitor/src/pages/library/library-book-detail.tsx`) that answers "how much have I read of this book?". Depends on task-46.1.

## Card contents

A single compact section, placed below the book metadata and above the action buttons:

- Total time read (e.g. "4h 12m")
- Session count (e.g. "9 sessions")
- Last read date (e.g. "2 days ago" — reuse existing relative-time helper if there is one)
- Average WPM across RSVP sessions for this book, if any (skip the line for scroll-only books)

If there are zero sessions for the book, hide the whole card. Don't show "0 sessions" — silence is better than vanity zero.

## Query

Add `getBookStats(bookId)` to `apps/capacitor/src/services/db/queries/stats.ts` (the file created in task-46.3). Returns:

```
{
  totalDurationMs: number;
  sessionCount: number;
  lastReadAt: number | null;
  avgWpmRsvp: number | null;
}
```

Single SQL aggregation over `reading_sessions WHERE book_id = ?`. No join needed.

## Out of scope

- Per-chapter breakdowns
- Reading speed graph for the individual book (could be a follow-up if interesting)
- Inline session list / history</description>
<acceptanceCriteria>["Book detail page renders a stats card below metadata, above actions, when the book has ≥1 session", "Card is hidden entirely when zero sessions exist for the book", "Total time, session count, and last-read are correct against the underlying rows", "Average WPM line appears only when there is at least one RSVP session for the book", "`getBookStats(bookId)` lives alongside the other stats queries"]
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Book detail page renders a stats card below metadata, above actions, when the book has ≥1 session
- [ ] #2 Card is hidden entirely when zero sessions exist for the book
- [ ] #3 Total time, session count, and last-read are correct against the underlying rows
- [ ] #4 Average WPM line appears only when there is at least one RSVP session for the book
- [ ] #5 `getBookStats(bookId)` lives alongside the other stats queries
<!-- AC:END -->
