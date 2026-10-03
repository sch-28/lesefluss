---
id: TASK-191.4
title: Profile and fix app performance on an e-ink / low-end Android device
status: To Do
assignee: []
created_date: '2026-10-02 22:44'
labels:
  - android
  - performance
  - ereader
dependencies: []
documentation:
  - apps/capacitor/src/services/telemetry/index.ts
  - apps/capacitor/src/pages/reader/scroll-view.tsx
  - apps/capacitor/src/pages/reader/page-view/index.tsx
parent_task_id: TASK-191
priority: medium
ordinal: 143000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measure before guessing. Attach Chrome DevTools to the app's WebView on a Boox (chrome://inspect over adb, the device is available to the maintainer) and record: cold start to library, opening a book in scroll mode and page mode, ten page turns, library scroll, explore scroll, and opening the reader appearance popover. Capture main-thread time, long tasks, layout thrash and GPU raster time. Then fix the top offenders, re-measure, and record before/after numbers in the task notes.

Known suspects from code reading, to confirm or rule out: 13 `backdrop-blur` surfaces (headers, sheets, dialogs, drawers) and box-shadows on a weak GPU; framer-motion mounts in social and stats; the scroll-mode reader's VList reconciliation plus the rAF fine-scroll chain on open; the 87 KB reader index.tsx re-rendering on every position tick; the 5 s session poll and live-board interval; sql.js/jeep-sqlite query cost on slow flash. E-ink mode (sibling task) removes blur and motion; this task is about CPU and I/O cost that remains with it on.

Also: record the WebView major version in telemetry events (the client already computes it for Settings > Diagnostics but does not send it) so the share of old-WebView installs can be read from `telemetry_events`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A profiling session on a real e-ink device is recorded in the task notes with numbers for cold start, book open (scroll and page), page turn, library scroll
- [ ] #2 The three largest measured costs are fixed or explicitly deferred with reasons
- [ ] #3 After fixes, book open and page turn on the e-ink device are measurably faster than before (numbers in notes)
- [ ] #4 Telemetry events carry the WebView major version; server schema and API accept it; unit test for the client payload
- [ ] #5 No regression in existing unit and e2e suites
<!-- AC:END -->
