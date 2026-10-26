---
id: TASK-214
title: 'Reader position: three gaps from the independent TASK-206 verification'
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
labels:
  - reader
  - bug
  - read-aloud
  - sync
milestone: m-13
dependencies: []
modified_files:
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/pending-position.ts
  - apps/capacitor/src/pages/reader/pending-position.test.ts
  - apps/capacitor/src/services/db/queries/books.ts
  - apps/capacitor/src/services/db/__tests__/device-position-write.test.ts
  - apps/capacitor/src/contexts/book-sync-context.tsx
  - apps/capacitor/e2e/read-aloud-position.spec.ts
  - apps/capacitor/src/pages/reader/page-view/index.tsx
  - apps/capacitor/src/pages/reader/__tests__/use-value-when-idle.test.tsx
  - apps/capacitor/e2e/reader-fonts.spec.ts
priority: high
ordinal: 187000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the owner-requested independent verification of the TASK-206 tree (session lesefluss-58, 2026-10-26). Each needs a red-before/green-after spec.

1. Read-aloud paused while the view is detached (call, sleep timer, earbuds): Q-a enters browse at the spoken word. If the user reads on by eye while still paused, every settle yields (keepsPositionOnMove) but savePosition returns while browsing, and browse's auto-commit can never fire because hasResumedReading requires !readAloud.isActive; flushes skip while browsing; endSession saves nothing when yielded. Nothing is saved until Read from here or stop. OWNER DECISION (2026-10-26): keep the browse bar, but let browse's normal auto-commit work while read-aloud is paused, the same as without read-aloud (glances stay safe, real reading gets saved). While playing, unchanged.
2. Pending fallback hole (pre-existing at HEAD): writePosition clears the localStorage pending entry whenever any write settles, so an earlier write landing clears the fallback of a later in-flight write; a hard kill in that window loses the later word. Clear only if the completing write is still the current one (persisted-word token current, or pending.word matches).
3. lastRead mixed units (new in 206.7): book-sync-context's device-ahead writes (both paths) stamp lastRead with the revision max(now, row.updatedAt + 1), while the reader stamps wall clock. On a clock-behind device recoverPendingWord (pending.at > lastRead) then rejects every pending entry for the skew window. Stamp lastRead with wall clock everywhere; only updatedAt is the revision.
Nit: a dead publishPositionSave function (no caller) remains in the reader bundle; remove it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Read-aloud paused + browse (Q-a) + reading on by eye: browse's normal auto-commit saves the read spot (e2e, red before); glances shorter than the auto-commit rule still save nothing; while playing behaviour unchanged
- [x] #2 A later in-flight write's pending fallback survives an earlier write landing (unit/e2e, red before)
- [x] #3 lastRead is wall clock on every writer; a clock-behind device still recovers a pending entry after a device-ahead write (unit, red before)
- [x] #4 Full capacitor e2e suite, @lowfps, vitest, tsc, biome pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 (lese-worker), for review.

1. Paused read-aloud + browse (Q-a) + reading on by eye.
- handleScrollPositionSettle feeds browse when read-aloud is off, or when it's paused (not playing) and a browse is already open (feedsBrowse). So a paused session's long moves still never enter browse (206.6's guard test stays green), while reading on at the browsed spot auto-commits as it would without read-aloud. Playing feeds nothing (unchanged).
- e2e (read-aloud-position.spec, fake clock): playing → looking away → pause (browse at the spoken word) → reading-paced wheel steps over the two-minute rule → the 'Reading position moved' toast, browse closed, saved word past the spoken one. Red before (no toast), green after.
- A glance (two wheels) keeps browse and saves nothing.

2. Pending fallback: writePosition clears the localStorage entry with the new clearOwnPendingPosition(id, { word, at }), only if the entry is still this write's (same word and stamp). A later in-flight write's entry survives an earlier write settling. Unit (pending-position.test): red with the old clear-regardless, green now.

3. lastRead units: the new devicePositionWrite(word, now, rowRevision) gives { lastRead: now (wall clock), updatedAt: max(now, rowRevision + 1) }, used by both device-ahead paths in book-sync-context and the DEV device hook. Unit: on a clock-behind device a later pending entry is still recovered after a device-ahead write; red with lastRead = revision (both cases), green now.

Nit: publishPositionSave had a caller, but its body stayed in the production reader bundle: with build.minify false, an `if (import.meta.env.DEV)` call inside writePosition left the function behind. It's bound through a module-level `const logPositionSave = import.meta.env.DEV ? publishPositionSave : null`, and dist now holds no __lesefluss_e2e code (checked).

Also closed with this batch (205.1 follow-up from the planner):
- useValueWhenIdle unit test: held across 100 ms checks while busy, applied when idle, no checks after unmount. Red without the hold.
- The timing-based fling e2e is replaced by a deterministic one: the 700 face held via CDP (past the reader's 3 s wait), released after 10 wheel steps; wheel steps continue until it has loaded plus 5; the anchor hold must not enter settling/holding meanwhile (DEV hold-phase hook). Green 8/8. Red 4/4 with (b) and (c) disabled and (a) kept, and red with only (c) disabled.
- The page-view drag hold is capped at 2 s (DRAG_HOLD_MAX_MS), for a mouse released outside the window.

Results (final tree, checkpoint):
- tsc (app, e2e, web), biome (pre-existing only);
- vitest: app 1434, core 208;
- full e2e with E2E_WORKERS=2, in thirds: 68 + 87 + 115 = 270/270;
- @lowfps 4/4;
- nothing left running.

2026-10-26 lese-planner: accepted after verification (DONE): paused-browse auto-commit, own-entry pending clear, wall-clock lastRead on device writes, DEV logger stripped from prod (confirmed in dist), 205.1 idle-hold unit test + deterministic CDP fling e2e (red 4/4 with the hold off), 2 s drag cap. Full e2e 270/270, @lowfps 4/4, vitest 1434 + core 208. Follow-up filed as TASK-218 (Undo of a paused auto-commit leaves read-aloud's view word on the disowned spot).
<!-- SECTION:NOTES:END -->
