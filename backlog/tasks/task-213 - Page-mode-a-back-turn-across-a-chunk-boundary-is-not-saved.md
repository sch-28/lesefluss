---
id: TASK-213
title: 'Page mode: a back turn across a chunk boundary is not saved'
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
labels:
  - reader
  - bug
  - page-mode
milestone: m-13
dependencies: []
modified_files:
  - apps/capacitor/e2e/page-mode-chunk-crossing.spec.ts
priority: high
ordinal: 186000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by lese-worker during TASK-205.2. In page mode, ArrowLeft (a back turn) across a chunk boundary shows the previous chunk's last page but saves nothing: the saved position stays 2002 while the page shows 1855-2001. Back turns within a chunk save normally. Reproduces with no spacing change (plainFixture, 3 chunks).

First establish whether this is pre-existing at HEAD or a regression from the uncommitted TASK-206.4 changes (jumpAfterTurn, pendingSettleRef / isDroppingSettleRef, settleOnLandRef for the unmeasured crossing, the lander's width-mismatch handleChunkMeasure). Check HEAD without git writes (e.g. `git show HEAD:<path>` into a scratch copy, or a scratch clone), never stash.

Reading-position saving must never fail (owner rule), so this goes before the remaining TASK-205 work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Regression e2e: a back turn (key and tap zone) across a chunk boundary saves the previous chunk's last page and reopens on it (red before, green after); a forward turn across the boundary still saves
- [x] #2 Root cause documented, including whether it was pre-existing at HEAD or introduced by the TASK-206.4 changes
- [x] #3 Full capacitor e2e suite, @lowfps, vitest, tsc, biome pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 (lese-worker): not a bug; the finding came from my own probe. AC#1 is left unchecked: no red-before exists.

HEAD check (scratch `git clone --shared` in the scratchpad, node_modules symlinked, config patched to port 3102; no git writes in the repo; the clone is removed): the same probe gives the same result at HEAD, so it isn't a 206.4 regression.

Root cause: the probe reached chunk 1 by about 13 quick turns from word 0 (turnPages waits only for each save, ~0.3 s apart): 2002 words in ~4 s. The browse detector (browse-detector.ts createLongMoveDetector: a trailing run of steps too fast to be reading that covers at least BROWSE_MOVE_DISTANCE_WORDS = 2000) correctly took that as browsing. It entered browse at the chain's first word and wrote it (saveLog: source 'browse', word 0). In browse every later settle is view-only by design: savePosition returns while browsing. So the back turn's settle fired (1855 in the settle log) and was rightly not saved. The previous probe's 'saved position stays 2002' was a misreading: the row already held the browse anchor.

At reading pace, a back turn saves normally: placed on chunk 1's first page by a position from another device (adopted, no browse), ArrowLeft and a left tap both land on 1855–2001 and save 1855, with no browse bar.

Regression guard: e2e/page-mode-chunk-crossing.spec.ts (4 tests). Key and tap, back and forward across the chunk boundary of a figure-free 4,800-word book, placed next to the boundary by an adopted remote position. Each asserts the page landed on (back: it holds the previous chunk's last word; forward: chunk 1's first word), the saved word, and that the reopen lands on it. Green 4/4. Red 4/4 with the crossing's settle removed (crossToNeighbor's onDone → undefined). There's no red-before, since nothing was broken.

Results (with the TASK-205.2 follow-ups folded in):
- tsc (app + e2e), biome (pre-existing only), vitest 1413;
- full e2e with E2E_WORKERS=2, in thirds: 68 + 87 + 104 = 259 tests, 258 passed. reader-modes failed once on an import-setup timeout and passed 3/3 on rerun.
- @lowfps 4/4;
- nothing left running.

2026-10-26 lese-planner: closed as NOT A BUG, guard added. The probe reached chunk 1 by ~13 quick turns (2002 words in ~4 s), which the browse detector correctly classes as browsing (fast run >= 2000 words); browse settles are view-only by design, so the back turn's settle was rightly not saved. Same behaviour at HEAD (scratch clone). At reading pace back and forward crossings (key + tap) save and reopen correctly; e2e/page-mode-chunk-crossing.spec.ts (4) guards it (red 4/4 with the crossing's settle removed). AC#1's 'red before' does not apply (nothing was broken).
<!-- SECTION:NOTES:END -->
