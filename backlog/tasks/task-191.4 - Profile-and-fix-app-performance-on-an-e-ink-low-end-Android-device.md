---
id: TASK-191.4
title: Profile and fix app performance on an e-ink / low-end Android device
status: Done
assignee: []
created_date: '2026-10-02 22:44'
updated_date: '2026-10-03 20:28'
labels:
  - android
  - performance
  - ereader
dependencies: []
documentation:
  - apps/capacitor/src/services/telemetry/index.ts
  - apps/capacitor/src/pages/reader/scroll-view.tsx
  - apps/capacitor/src/pages/reader/page-view/index.tsx
modified_files:
  - apps/capacitor/android/app/src/main/java/app/lesefluss/MainActivity.java
  - apps/capacitor/src/services/db/index.ts
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/page-view/index.tsx
  - apps/capacitor/src/pages/reader/page-view/measurements.ts
  - apps/capacitor/src/pages/reader/page-view/__tests__/measurements.test.ts
  - apps/capacitor/src/services/telemetry/index.ts
  - apps/capacitor/src/services/telemetry/__tests__/payload.test.ts
  - apps/capacitor/e2e/page-mode-chunk-crossing.spec.ts
  - apps/capacitor/e2e/helpers/big-book.ts
  - apps/web/src/db/schema.ts
  - apps/web/src/routes/api/telemetry.ts
  - apps/web/drizzle/0033_telemetry_webview.sql
  - apps/web/drizzle/meta/_journal.json
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
- [x] #1 A profiling session on a real e-ink device is recorded in the task notes with numbers for cold start, book open (scroll and page), page turn, library scroll
- [x] #2 The three largest measured costs are fixed or explicitly deferred with reasons
- [x] #3 After fixes, book open and page turn on the e-ink device are measurably faster than before (numbers in notes)
- [x] #4 Telemetry events carry the WebView major version; server schema and API accept it; unit test for the client payload
- [x] #5 No regression in existing unit and e2e suites
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Measure first on the connected Boox Nova Air 2 (debuggable build, WebView driven over CDP), at CPU throttle 1x and 3x (cheap-reader proxy): cold start, book open (page and scroll mode), page turn, Explore render, JS heap; traces attribute time to parse/compile, render, layout, SQLite bridge calls. Fix the three largest measured costs (candidates: unminified 2.7 MB main chunk, eager imports at startup, reader re-renders per turn, SQLite query count, cover decoding), re-measure with the same script. Add the WebView version to telemetry events (client field, server column + migration 0033, test).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Device: Boox Nova Air 2 (Snapdragon 662, 2.7 GB, Android 11, WebView 149), debuggable build, WebView driven over CDP. 1x = device as is, 3x = CDP CPU throttle as a cheap-reader proxy. 5 runs per scenario, median (worst). Books: Moby Dick (~210k words), Dracula. Bridge logging switched off at runtime so debug-build logging does not inflate numbers. Times are app-side (script, layout, paint into the WebView frame); the panel's e-ink refresh mode comes after that and is not part of these numbers.

Cold start (am start -W TotalTime, committed build): 2086 ms (worst 3795), DCL 594, FCP 1472, LCP 1840.

| Scenario | before 1x | after 1x | before 3x | after 3x |
|---|---|---|---|---|
| Open, page mode, Moby Dick | 1899 (2810) | 685 (1582) | 6743 (8901) | 2157 (2250) |
| Open, page mode, Dracula | 1293 (1557) | 714 (1095) | 4490 (4932) | 2400 (3406) |
| Open, scroll mode, Moby Dick | 768 (809) | 787 (921) | 2444 (3252) | 2345 (2490) |
| Open, scroll mode, Dracula | 930 (1410) | 751 (811) | 2798 (3029) | 2344 (2386) |
| Page turn, key | 215 (668) | 147 (205) | 504 (2236) | 423 (599) |
| Page turn, tap | 168 (653) | 143 (235) | 537 (2358) | 433 (663) |
| Long tasks per 10 key turns | 2964 ms | 1580 ms | 8317 ms | 5495 ms |
| Explore landing | 835 (949) | 834 (1029) | 2946 (5642) | 2903 (5274) |

Library scroll (maintainer's synced library, 16 books, 2890 px; read-only run, top to bottom at 40 px per frame): 1x frame p50 25 ms, p95 28 (worst 37), max 42 (worst 58), 0 ms long tasks; 3x p50 24, p95 27 (worst 30), max 30 (worst 39), 0 ms long tasks. Frame time is the display cadence, not CPU bound; nothing to fix.

Fixes (the three largest measured costs):
1. Reader `entriesByParagraph` built a word object for every word in the book via `wordIndex.listEntries()` on every open (~330 ms script + ~700 ms GC on Moby Dick). Now reads byte offsets directly.
2. Page view opened by laying out three column chunks (prev, current, next); the chunk `apply` forced layout was the largest single cost on open. Neighbours now join the window one frame after the current page has painted, on open and after every chunk crossing. This also removed the worst-case turn (the turn that crosses a chunk paid the next neighbour's layout synchronously): 668 -> 205 ms at 1x, 2236 -> 599 ms at 3x.
3. `readFirstVisibleWord` read client rects of every word before the target page on each turn; now a binary search plus a page-sized scan.

Robustness found while profiling:
- WebView renderer death (low memory, crash) took down the whole app. MainActivity now handles onRenderProcessGone by restarting the app process. A first version recreated the activity instead, but that left the dead WebView and old activity alive (dumpsys meminfo: 2 activities, 2 WebViews after forced GC, DevTools detached). Verified on device with CDP Page.crash: new pid, 1 activity, 1 WebView, library back, still signed in.
- A WebView reload left a stale native SQLite connection ("Connection lesefluss already exists") and showed the reset-data screen. initDb runs checkConnectionsConsistency first. Verified on device with location.reload.

Deferred:
- Explore stays at about 3.3 s of long tasks at 1x; not on the reading path, left for a follow-up.
- Unminified bundle (minify: false): cold start FCP ~1.5 s; not among the three largest measured costs, not changed.
- Book content is read twice on open (getBookContent + loadBookWordIndex); small in the profile (readLongText ~60 ms), not changed.

New e2e: page-mode-chunk-crossing.spec.ts (turns across two chunk boundaries forward and back). The bigBookFixture got a paragraphCount option.

Verification: capacitor vitest 1026 passed, core 161, web 86 (+174 DB-integration skipped); tsc clean in capacitor and web; full capacitor e2e 134 passed (before the MainActivity process-restart change, which is Android-only and verified on device).

Restart-loop guard: a renderer death within 30 s of the previous restart closes the app instead of restarting (SharedPreferences timestamp on elapsedRealtime). Verified on device: crash 1 restarts (new pid), crash 2 within 30 s closes, crash 3 after the window restarts again (1 activity, 1 WebView).

Review pass (5 agents) and fixes:
- Page view: a turn back before the previous chunk had mounted landed on that chunk's first page and saved nothing (fallback in crossToNeighbor guessed one page). The fallback now hands the edge word to the lander, which lands on the right page and reports the settle. That exposed a pre-existing gap: chunk-content registered its element in a passive effect, so a chunk remounting with an unchanged stored width was never landed (also hit TOC/search jumps back to a visited chunk); registration is now a layout effect. A drag also mounts the full window at once instead of showing empty space.
- Pre-existing, found while testing: a key turn (Boox page buttons) pressed during a chunk-crossing animation was lost, because goNext ran against the old page. Key turns now finish the in-flight animation first and call the refreshed goNext/goPrev.
- readFirstVisibleWord: dropped the boundary slack (dead under the monotonic-page invariant), stated the invariant; tests added for a word split across a column break (round-trips through findPageForWord), a figure-only page, the last page and right-to-left order.
- Android: restart only when the activity is resumed. In the background, or with a picker, camera or sign-in tab of ours on top, the process dies quietly (Android starts it fresh on return, no lost picker/tab, no app popping forward, no loop-guard timestamp). NativeHttpPlugin's two helper WebViews now handle onRenderProcessGone too (all WebViews share one renderer; any false return crashed the app) and reject their call.
- Telemetry test: resetModules between tests, non-Chromium UA case.
- e2e page-mode-chunk-crossing.spec.ts: paced turns both ways, fast key turns across boundaries, and a back turn with animation frames held so the neighbour is provably unmounted.
Verified: capacitor e2e 135 passed, unit tests and tsc green. On device: foreground renderer crash restarts (new pid, app on top); background crash ends the process with the Boox launcher staying on top; reopening is a normal cold start.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Profiled the app on a Boox Nova Air 2 over CDP at 1x and 3x CPU throttle, fixed the three largest measured costs, and found and fixed two crash paths.

- Book open in page mode: 1899 -> 685 ms (Moby Dick, 1x), 6743 -> 2157 ms at 3x. Reader no longer builds a word object for every word on open; page view lays out only the current chunk and mounts neighbours after the first paint.
- Page turn worst case: 668 -> 205 ms at 1x, 2236 -> 599 ms at 3x (deferred neighbour layout on chunk crossings, binary search in readFirstVisibleWord).
- WebView renderer death now restarts the app process instead of crashing it; a WebView reload no longer lands on the reset-data screen (checkConnectionsConsistency before createConnection).
- Telemetry events carry the WebView version (client field, telemetry_events.webview_version, migration 0033).
- Library scroll measured: display-bound, no long tasks.

Tests: new measurements unit test, telemetry payload test, page-mode-chunk-crossing e2e; capacitor/core/web vitest and full capacitor e2e green.

Deploy note: migration 0033 must run with or before the web deploy; the new telemetry route writes webview_version. Old app versions do not send the field and are unaffected.

Deferred: Explore long tasks, unminified bundle, double content read (all smaller than the fixed costs; numbers in notes).
<!-- SECTION:FINAL_SUMMARY:END -->
