---
id: TASK-106
title: 'Web novels: newly imported series not first when sorted by recent'
status: Done
assignee: []
created_date: '2026-04-26 09:41'
updated_date: '2026-04-26 15:56'
labels:
  - bug
milestone: m-11
dependencies: []
references:
  - apps/capacitor/src/services/db/queries/series.ts
  - apps/capacitor/src/services/serial-scrapers/
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After importing a new web novel series, the library's "sort by recent" view does not place it at the top of the list. The series appears somewhere lower, suggesting the `updated_at` / `last_read_at` timestamp used for the recent sort is not being set correctly on import (or is being compared against chapter rows rather than the series row).

Investigate which timestamp column drives the "recent" sort for series in the library query, confirm it is set on import, and fix any cases where it is missing or stale.

Likely starting points: `apps/capacitor/src/services/db/queries/series.ts` and the series `commit.ts` in the serial-scrapers pipeline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Importing a new web novel series immediately places it at position 1 when the library is sorted by recent
- [x] #2 Existing series order is unaffected by the fix
- [x] #3 pnpm check-types passes
<!-- AC:END -->
