---
id: TASK-206.4
title: 'Page mode: page turns right after a jump are saved'
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
labels:
  - reader
  - bug
  - page-mode
dependencies:
  - TASK-208
modified_files:
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/page-view/index.tsx
  - apps/capacitor/src/test-hooks/reader.ts
  - apps/capacitor/e2e/page-mode-turn-after-jump.spec.ts
  - apps/capacitor/e2e/types.d.ts
  - apps/capacitor/e2e-repro/README.md
parent_task_id: TASK-206
priority: high
ordinal: 180300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed at normal frame rate (3/3, several scenarios): in page mode, a page turn within ~1.5-2 s after a TOC or search jump is not saved, and back/reopen lands on the jump page. Worst case: jump, turn while browsing, then "Read from here" commits the jump target, not the page on screen. A timing sweep shows turns at 1.8-2.0 s after the TOC click lost and turns at 2.2 s+ saved.

Cause: JUMP_SETTLE_GUARD_MS (1500 ms) / isJumpSettle in handleScrollPositionSettle (pages/reader/index.tsx) also applies in page mode and returns before lastWordRef is updated. The guard exists for scroll mode's virtual-list reconcile settles; page mode has no such reconcile.

Fix: in page mode, real page turns always count. Preferred: the jump's own settle doesn't go through the settle path (e.g. same-chunk jumpTo passes shouldSettle:false, as followWord does) and the time guard is not applied in page mode. Also check BLE live seeks in page mode, which may save the page start for the same reason (unverified without hardware).

Repro: scratchpad repro-v1/apps/capacitor/e2e/repro-page-turn-after-jump.spec.ts (+ helpers/repro-novel.ts); port it into the repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Ported regression spec: TOC jump / search jump / jump-to-current-word followed by a quick turn (key and tap zone) saves the turned page and reopens on it; jump + turn while browsing + Read from here commits the page on screen (red before, green after)
- [x] #2 The timing sweep (turns 0.5-3 s after the jump) all save
- [x] #3 Scroll-mode jump settle protection unchanged (jump-settle-guard and TOC/search jump specs still green)
- [x] #4 Full capacitor e2e suite, vitest, tsc, biome pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 (lese-worker), parked for the TASK-206.3 review fixes. State so far:

Fix (in tree):
- index.tsx: new isReconcilingJump() = paginationStyle === 'scroll' && within JUMP_SETTLE_GUARD_MS of the last jump. It replaces both time checks: the settle guard and the read-aloud detach guard. Page mode has no list reconcile, so every page-mode settle is a real turn.
- page-view jumpTo, same chunk: turns with shouldSettle:false and sets currentWordRef to the target, like followWord. A cross-chunk jump lands through the lander, which never settled anyway.
- BLE live seek: the handler is extracted into followDevicePosition (the BLE subscription calls it) and exposed in DEV as __lesefluss_e2e_devicePosition (test-hooks/reader.ts exposeDevicePosition).

New e2e/page-mode-turn-after-jump.spec.ts (12 tests):
- TOC jump + Read from here + quick key turn;
- the same with a tap-zone turn;
- search jump + quick turn;
- a jump to the current word (no browse) + quick turn;
- browse + turn + Read from here commits the page on screen;
- a timing sweep at 500/1000/1500/1900/2300/3000 ms;
- BLE seek in page mode.
Each save case also reopens on the turned page.

Red checks (sed, restored from copies, cmp-verified):
- both fixes reverted: 9 fail (all the quick cases and the sweep at 500-1900 ms; 2300 and 3000 pass, matching the repro's 2.2 s boundary);
- guard reverted only: the same 9 fail;
- jumpTo settle restored only: the jump-to-current-word case fails, and the BLE case fails when the device word is in the open chunk.
- BLE: before the fix, a same-chunk seek saved the page's first word (1 save request; it would also push it back to the device); now 0. A seek into another chunk lands through the chunk swap and never settled.
- The repro and helpers/repro-novel.ts are removed from e2e-repro; README updated.

Checks: tsc, biome, vitest 1343 green. A full suite run was started before parking.

2026-10-26 resumed and finished (lese-worker), for review.

Nothing changed for 206.4 since parking. Verification on the tree that also holds the 206.3 review fixes:
- full default e2e run 204/204, including page-mode-turn-after-jump (12) and the scroll-mode jump protection specs: jump-settle-guard, position-toc-heading-landing, browse-mode, chapter-jump-first-word (AC#3);
- the run before parking (without the 206.3 review fixes) was 202/202 as well;
- tsc (app + e2e) and biome clean; vitest app 1354, core 195.

AC#1 and AC#2 red/green: see the red checks above (9 red with the guard applied in page mode; the sweep is red at 500-1900 ms before the fix and green at 500-3000 ms after).

BLE live seek: same-chunk seeks in page mode used to save the page's first word (and would push it back to the device). Now covered by the e2e via the DEV hook __lesefluss_e2e_devicePosition, which calls the same followDevicePosition the BLE subscription uses.

2026-10-26 round 2 fixes (lese-worker).
7. T1/T2: DEV publishes the jump stamp (__lesefluss_e2e_lastJumpAt via a stampJump helper, which replaces all 5 `lastJumpAtRef.current = Date.now()` sites) and a timestamped settle log (__lesefluss_e2e_settleLog). turn({insideJumpGuard}) asserts settleAt - lastJumpAt < 1500 ('the turn came too late to exercise the jump guard window'). The sweep counts from the stamp at 1100/1300/1500/1900/2300/3000 ms: a commit takes about 750 ms after the stamp, so 500 isn't reachable, and the quick cases cover the earliest turns.
8. T3: the sweep, BLE and quick cases check the DB row after waitPositionQuiet (expectSavedAndReopensOn). T4: the BLE word is picked from the chunk of the page's first word, and the test asserts the first visible word changed. T5: a new same-chunk different-page case (Chapter 2 from the start, chunk 0) + a quick turn asserts the only 'settle' save is the turn's.
9.-11. Page view:
- jumpTo and followWord go through jumpAfterTurn, which completes an in-flight turn first (its settle stays the reader's), clears settleOnLandRef, and calls the latest moveTo via a ref (a completed crossing changes chunk state).
- moveTo retargets a pending landing (pendingTargetRef !== null) instead of turning.
- goNext, goPrev and pointer-down are no-ops while a landing is pending.
- New e2e: a BLE seek during a key turn's 220 ms slide keeps exactly one 'settle' save, the turned page.
- R2 (turns ignored while pending) has no e2e: the landing usually completes within a frame, so a test couldn't reliably hit the window.

Red checks (restored, cmp-verified):
- no turn completion: the sliding-turn case fails;
- the guard back in page mode: 7 fail (the quick cases, the same-chunk case and sweep 1100; sweep 1300+ settles after the window and is a control);
- the jump settling again: the current-word, BLE and sliding-turn cases fail. The same-chunk case browses, and a browsing settle doesn't save, so it doesn't catch that one.

Spec: 14/14. tsc, biome, vitest green. The full e2e run + @lowfps was stopped by Claude Code for low system memory; not rerun yet.

2026-10-26 round 3 (lese-worker).

MEDIUM, the jump supersedes the turn (the preferred fix; one place covers every caller: BLE, TOC/search, read-aloud follow):
- animateTo keeps the turn's state commit (pendingOnDoneRef) and its settle (new pendingSettleRef) apart.
- completeInFlightAnimation({ settle }) always commits the state and runs the settle only if asked.
- jumpAfterTurn completes with settle:false, so the turn's page/chunk state is committed but its settle is dropped.
- goToPage and the measured crossing pass their settle separately; the unmeasured crossing settles via settleOnLandRef, which jumpAfterTurn clears.
- The docblock is corrected.
- E2E rewritten: a BLE position arriving during a turn's slide wins. No settle, no save request (so nothing is pushed to the device), and the DB row is unchanged. Red with settle:true (round 2's behavior): the settle count goes up by 1. There is no TOC variant: a TOC jump needs sheet clicks, which take longer than the 220 ms slide; jumpAfterTurn is the same path for every caller.

LOW:
- pointer-down while a landing is pending records the pointer id; pointer-up and pointer-cancel return early for it, so its release isn't taken for a tap.
- The lander, on a width mismatch, calls handleChunkMeasure(chunkIndex, el.scrollWidth) instead of returning silently, so a pending target can't stick.
- exposeDevicePosition returns a cleanup that deletes the hook only if it's still ours.
- publishSettle uses ??= [] + push.

Also the 206.3 nits: the chapters.ts doc no longer overclaims, and scroll-view wordOffsetFromTop's `span` is renamed `target`.

Results:
- tsc (app + e2e), biome, vitest 1363 green;
- page-mode specs 26/26;
- full default e2e run 209/209 (6.3 min);
- @lowfps 4/4;
- no leftover processes.

2026-10-26 lese-planner: accepted after round 3 + verification (DONE). Full e2e 210/210, @lowfps 4/4, vitest/tsc/biome green. Two non-blocking follow-ups handed to lese-worker alongside TASK-206.6: (1) an unmeasured crossing superseded by a jump can still land-settle inside flushSync(done) when the neighbour was measured during the slide. Drop the land-settle before done runs. (2) A mouse pointer id ignored during a pending landing and released outside the container swallows one later pointerup; delete the id on the non-pending pointerdown path.
<!-- SECTION:NOTES:END -->
