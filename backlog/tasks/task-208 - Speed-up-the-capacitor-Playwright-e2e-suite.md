---
id: TASK-208
title: Speed up the capacitor Playwright e2e suite
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
labels:
  - testing
  - dx
milestone: m-13
dependencies:
  - TASK-206.1
priority: medium
ordinal: 179500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The full capacitor e2e suite takes ~18 min for 167 tests (~6.5 s each), and targeted repeat runs take ~10 min. That slows every review loop, especially for the reader/position work (TASK-206).

Likely causes (not yet measured):
- `apps/capacitor/playwright.config.ts` runs `workers: 1`, `fullyParallel: false`
- fixed sleeps instead of event waits: `reader.OPEN_SETTLE_MS` 1.5 s, `waitPastJumpGuard` 1.5 s, `REFLOW_SETTLE_MS` 2 s, the 4 s idle per reopen in position-reopen.spec.ts
- every spec re-imports its fixture through the real file picker (resetStorage + parse + WordIndex + SQLite)
- jeep-sqlite on web saves the whole DB to IndexedDB after each write
- specs run against the vite dev server (unbundled modules), not a built bundle

Approach:
1. Measure first. Use the Playwright trace/timing report for per-spec and per-phase time: setup/import, waits, assertions.
2. Then apply in order of payoff:
   - parallel workers, after checking that specs share no state (storage is per context; the port and dev server are shared)
   - replace fixed sleeps with event waits via the save log hooks (`__lesefluss_e2e_save`, `__lesefluss_e2e_saveLog`) or layout-settled signals
   - a DEV seed hook that writes a parsed fixture straight into the DB, keeping a few specs for the real import flow
   - optionally run against `vite preview` of a build
   - keep slow lanes (TASK-206 1 fps BeginFrameControl lane, repeat-each runs) in a separate tagged job

Do not weaken any assertion. The position specs exist to catch progress-loss regressions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A timing breakdown of the current suite (per spec, and per phase: import / storage reset / open / the rest, with sleeps folded into the rest) is recorded in the task notes
- [x] #2 The full default suite runs at least 2x faster than the ~18 min baseline on the same machine, with the same test count and no weakened assertions
- [x] #3 Specs are safe to run in parallel (no shared state, no port or dev-server conflicts); 3 consecutive full runs pass with no new flakes
- [x] #4 Fixed sleeps in reader/position specs are replaced by event-based waits where possible; any remaining sleep has a one-line reason
- [x] #5 Slow lanes (1 fps lane, repeat runs) are tagged and can run separately from the default suite
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 owner: schedule right after TASK-206 step 1 (post-open hold + frame-aware stability), before further TASK-206 work, so every later review loop is faster.

2026-10-26 AC#1 baseline, partial (lese-worker). Paused for the TASK-206.1 review fixes.

Run: full default suite, workers 1, vite dev server, JSON reporter. 175 tests, wall 1453s (24.2 min), 174 passed, 1 failed (position-late-resize 'cut after a reopen', one fps variant: a new 206.1 spec, being reworked in the review fixes).

Phases come from `test.step` wrappers added to e2e/helpers/seed.ts (import, open) and helpers/storage.ts (reset). Summed test time 1448s:
- import through the file picker: 284s (20%)
- resetStorage: 57s (4%)
- open book: 39s (3%)
- everything else: 1068s (73%), sleeps included. The JSON report has no pw:api steps, so waitForTimeout is not split out yet; next: wrap page.waitForTimeout in a step via an auto fixture.

Static sleep inventory: 72 waitForTimeout calls. Top: reader.OPEN_SETTLE_MS (1.5s) x16, QUIET_MS x8, 500ms x6, IDLE_MS x5, SETTLE_MS x3, REFLOW_SETTLE_MS x2, the 4s idle per reopen.

Per spec file (total s / tests / import s):
- position-reopen 261/4/9 (the two 1fps cases about 91s each, the 63fps cases about 40s)
- scroll-mode-appearance-anchor 207/18/44
- library-bulk-select 110/10/0
- position-late-resize 102/4/10
- browse-mode 82/10/23
- page-mode-chunk-crossing 76/2/5 (one test 49s)
- position-end-of-book 73/7/16
- reading-goal 49/5/12
- reader-images-progress 44/7/16
- position-settle-paragraph-start 28/5/11
- page-mode-orientation 27/3/8
- import-folder 24/3/0
- page-mode-appearance-anchor 23/2/0
- session-pause 22/4/9
- eink-mode 22/10/3
- the rest under 17s each

First conclusions:
- Import is about 1.6-2.5s per test, the largest fixed per-test cost, so a DEV seed hook pays off broadly.
- The 1fps lane (2 tests, 181s) plus the 63fps reopen and late-resize cases (about 180s) are about 25% of the wall time: tag them as a slow lane.
- workers: 1 serialises everything; next is checking state isolation for parallel workers.

2026-10-26 first parallel run (CLI flags only, config unchanged): `--workers=4 --fully-parallel`, default suite (172 tests, @lowfps excluded): 172/172 passed, wall 317s (5.3 min) vs 1212s (20.2 min) at 1 worker on the same tree. That is 3.8x. Isolation review: storage is per browser context; network mocks are page.route; import-folder uses mkdtemp; framedPage launches its own browser. Machine: 16 cores, 30 GB. Still to do: 3 consecutive runs for flakes (AC#3), a config change, waitForTimeout measurement, sleeps -> events (AC#4). Paused again for TASK-206.1 round 2.

2026-10-26 playwright.config.ts: fullyParallel true, workers = E2E_WORKERS ?? 4.

3 consecutive full default runs (174 tests): 335s / 321s / 320s.
- Run 1: 173/174. One failure in explore-browse.spec.ts:186, 'the search query is in the URL, survives a detail round trip and becomes a recent search': locator.click timeout (60s).
- Runs 2 and 3: 174/174.

AC#3 is NOT met yet: that explore-browse flake must be investigated (parallel load or a pre-existing race) and fixed before 3 clean runs. Paused again for TASK-206.1 round 3.

AC#4 plan: replace the reader.OPEN_SETTLE_MS sleeps with waitRevealed plus the remaining cooldown (for unaligned opens only). The negative-assertion idles ('nothing saved for X ms') stay, each with a one-line reason.

2026-10-26 explore-browse flake: root cause was an app bug, not the parallel setup.
- Cause: in src/pages/explore/search-field.tsx, pressing Clear blurs the field and starts a 150ms 'hide recent' timer, and the following refocus didn't clear it. Under parallel load the timer then hid the list mid-click.
- Fix: clearTimeout in onFocus.
- Results: the test went 7/12 -> 24/24 under 4 workers. New unit test src/pages/explore/__tests__/search-field.test.tsx, red without the fix.
- The full default suite after the fix: 175/175 in 323s.
- AC#3 still needs 3 consecutive clean full runs on the final tree.

2026-10-26 TASK-208 results (lese-worker), for review. Config and test infra only, plus the explore search-field app fix found by the parallel runs.

AC#2 speed: the full default suite takes 310-311s (5.2 min) for 175 tests at 4 workers.
- vs this machine's 1-worker baseline: 1453s (175 tests) / 1212s (172, @lowfps excluded); about 4.7x / 3.9x.
- vs the ~18 min (1080s) description baseline: about 3.5x.
- Same tests, no assertion weakened.

AC#3 parallel safety: 3 consecutive full runs on the final tree, 175/175 each. Two flakes surfaced on the way and were fixed at their cause:
- the explore search-field app bug (blur timer not cleared on refocus);
- a framed-spec save wait that started before a click which can take seconds at low frame rates under load (reader.commitReadFromHere).

AC#4 sleeps in the reader/position specs:
- reader.waitOpenSettled (reveal event + the 500ms post-open cooldown, which now only applies to opens at word 0) replaces the 1.5s OPEN_SETTLE_MS after opens: 10 sites in browse-mode, position-settle-paragraph-start, scroll-mode-appearance-anchor (4), reader-images-progress, position-fling, position-hold-handback, import-attach, plus 3 in reading-goal and position-end-of-book's openSettled.
- Every remaining sleep has a one-line reason, as a comment or on its constant. They are negative 'nothing is saved for X ms' windows, a scroll's settle before the next step, polling loops, gesture timing, and page mode, which has no landed event.

AC#5 slow lanes: @lowfps (the 1fps BeginFrameControl cases) is excluded from the default run by grepInvert unless E2E_LOWFPS is set; `pnpm e2e:lowfps` runs it (4 tests, about 100s). Repeat runs stay a CLI flag (--repeat-each). E2E_WORKERS overrides the worker count (1 to debug).

Also: e2e/tsconfig.json, with `tsc -p e2e` in check-types. The timing steps in the seed and storage helpers stay, for future breakdowns.

AC#1 is left for review: the per-spec and per-phase (import/reset/open/other) breakdown is recorded above, but the sleep share of 'other' is not split out (the JSON report has no pw:api steps).

Not done (optional per the description): a DEV seed hook, which would remove about 20% of the summed test time, and running against vite preview.

2026-10-26 review fixes (2 reviewers; lese-worker).

New DEV hooks (test-hooks/reader.ts):
- __lesefluss_e2e_saveRequests: counted at the top of writePosition, after TASK-206.2's unchanged-word guard, next to writePendingPosition.
- __lesefluss_e2e_settles: counted at the top of handleScrollPositionSettle.
- __lesefluss_e2e_hold: the anchor hold phase, via a setPhase helper in use-anchor-hold.
- Page object: saveRequestCount, settleCount, waitForSettleAbove, waitHoldIdle, savedRow.

1. HIGH, end-of-book clamp specs (4 tests: no-move scroll, 1px clamp + keyboard, keyboard closing, up-and-back):
- They first end the open hold with real input that can't move the view (endHoldAtBottom: a 1px wheel at the bottom, then waitHoldIdle).
- expectSettledWithoutSave asserts the settle count went up while the save-request count didn't.
- Red check: with the TASK-174 guard in handleScrollPositionSettle disabled (`if (false && settledWord !== null && ...)` via sed, then restored from a copy; grep confirmed), all 4 fail and the other 3 pass. Green with the guard.
2. leaveReader waits for the pending position to clear, then returns the DB word (reader.savedRow). expectSavedAfterLeaving and 'scrolling back' compare the DB, with no fixed 300ms.
3. Negative checks count save requests, not committed saves: expectNoSaveFor (settle-paragraph-start), expectNoNewSave / expectAnchoredWithoutSave (appearance-anchor, 8 baselines), browse-mode's browse case, late-resize expectHeld.
4. hold-handback: reopenDeep waits for the unmount flush (pending null) before reopening; the tests take the first 'settle' saveLog entry after their baseline.
5. appearance-anchor leaveToLibrary waits for pending null.
6. 'Two scrolls within one debounce' (settle-paragraph-start away-and-back, end-of-book up-and-back) run in one page.evaluate: a synthetic wheel event first (so the hold counts reader input), then both scrollTop steps one rAF apart, from one measurement.
7. browse-mode: waitForNextSave started before the wheel, then the browse bar is hidden; the 1000ms sleep is gone.
8. settle-paragraph-start (figure) and reader-images-progress wait for that move's settle (waitForSettleAbove), not a fixed sleep. A save is not guaranteed there (the same top word saves nothing).
9. settle-paragraph-start mid-paragraph: polls until paragraph 3's start sits at -40 +-1px, reads the expected top word there, asserts start < expected < paragraph 4's start, then waits for the save and compares.
10. waitOpenSettled doc says it covers only the word-0 cooldown; waitHoldIdle covers the hold.
11. commitReadFromHere returns the word of the 'browse' saveLog entry.
12. workers come from E2E_WORKERS: a count, or a share like '50%' (Playwright rejects a numeric string, hence workersFromEnv); default 4. `pnpm e2e:lowfps` runs with E2E_WORKERS=2.
13. The webServer sets E2E_SERVER=1. vite.config then pre-bundles every dependency up front (optimizeDeps.entries over all sources) and turns HMR off, so a dependency found mid-run or a file saved during a run can't reload open pages.
14. OPEN_SETTLE_MS renamed LIST_SETTLE_MS, doc fixed; the stale 'Also' in end-of-book removed; wheelTargetTo doc narrowed; one-line reasons added to the sleeps in session-pause, selection-dismiss and auto-open-last-book.
15. AC#1 reworded to what was measured.

Also in the tree (TASK-206.2): reader-modes.spec.ts no longer waits for an 'exit save' when RSVP exits on the already-saved word; its reopen assertion still checks the position.

Results (tree including the TASK-206.2 guard):
- tsc app + e2e clean; biome clean; vitest 1324/1324.
- 3 consecutive full default runs at 4 workers: 179/179 each (314s / 313s / 312s).
- @lowfps via pnpm e2e:lowfps (2 workers): 4/4 in 2.3 min.

2026-10-26 round-2 fixes (lese-worker):
A. New reader.leaveFlushed(page): goes back, waits for .reader-scroll-content to be gone (the URL changes before React unmounts the reader), then for the pending position to be null. Used by end-of-book leaveReader, appearance-anchor leaveToLibrary, hold-handback reopenDeep and position-flush-no-restamp.
B. New reader.waitPositionQuiet(page): no new settle for 400ms, then committed saves === save requests. settle-paragraph-start (figure) and reader-images-progress use it before taking a save baseline.
C.
- mid-paragraph: one poll on |offset + 40| <= 1;
- waitHoldIdle doc: unset counts as idle, and an unmount releases the hold, so no phase carries over;
- away-and-back uses reader.expectSettledWithoutSave (moved from end-of-book into the page object);
- the config comment says a reused hand-started dev server keeps HMR and on-demand pre-bundling;
- workersFromEnv falls back to the default for anything but a positive integer or a '%' share.

Also: wordLineOffsetFromTop also finds a heading by [data-heading-word]. This is needed by TASK-206.3, where a TOC jump commits the chapter title's own first word.

Results: 3 consecutive full default runs at 187/187 (5.4-5.5 min); @lowfps 4/4; vitest, tsc, biome clean.

2026-10-26 lese-planner: accepted after 3 review passes (2 reviewers + 2 verifications). Full default suite ~18-24 min at 1 worker -> ~5.4 min at 4 workers, 3 consecutive clean runs, no assertion weakened (several strengthened: save-request counts, settle-ran checks, DB reads after a real unmount flush). Remaining nits (leaveFlushed in position-reopen/late-resize, stricter '%' check for E2E_WORKERS) handed to lese-worker as follow-ups.
<!-- SECTION:NOTES:END -->
