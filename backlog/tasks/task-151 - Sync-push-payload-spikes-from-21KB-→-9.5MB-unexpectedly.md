---
id: TASK-151
title: Sync push payload spikes from 21KB → 9.5MB unexpectedly
status: To Do
assignee: []
created_date: '2026-05-21 22:12'
labels: []
milestone: m-10
dependencies: []
priority: medium
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In a recent capture (TASK-145/149 debugging session), the sync push payload jumped from ~21KB to 9,525,625 bytes (~9.5MB) without an obvious user action between the two pushes.

Log excerpt:
```
[sync] push payload books=8 standalone=8 chapterRows=0 highlights=4 glossaryEntries=1 series=0 readingSessions=65 bodyBytes=21706 topSeries=[]
…
[sync] push payload books=8 standalone=8 chapterRows=0 highlights=4 glossaryEntries=1 series=0 readingSessions=65 bodyBytes=9525625 topSeries=[]
```

The counts (books=8, sessions=65, etc.) are identical between the two pushes; only `bodyBytes` exploded. Suggests one of the rows started carrying a much larger payload — possibly a book content blob accidentally included in a row that should only carry metadata, or a highlight row with an enormous text snippet, or a session row with a serialized array.

Likely culprits:
- A book row's `chapters` JSON or some auxiliary column doubled up.
- Reading session schema added a column that holds the book content (unlikely but possible regression from a recent migration).
- Highlight rows now include the full surrounding paragraph text as a `context` column.
- JSON serializer hit a circular reference and serialized object identity instead of failing.

Investigation:
1. Capture the actual push body for both small + large case. Diff. Identify the swollen row.
2. Audit recent schema migrations in apps/capacitor/src/services/db/schema.ts for new TEXT columns that get serialized into the sync payload.
3. Check apps/capacitor/src/services/sync — what columns ship and whether any are size-unbounded.

Acceptance:
- Identify the swelling source.
- Confirm whether the 9.5MB push is intended (e.g. one-time content backfill push) or a bug.
- If bug: cap the payload column or drop it from sync; verify subsequent pushes stay at small KB sizes when nothing genuinely changed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root cause of the 9.5MB push payload identified (row + column responsible)
- [ ] #2 If bug: payload reduced to expected KB size when no real change happened
- [ ] #3 If intended: documented why and gated behind a one-time / opt-in flag rather than firing on every push
<!-- AC:END -->
