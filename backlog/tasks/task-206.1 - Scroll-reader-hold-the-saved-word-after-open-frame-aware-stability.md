---
id: TASK-206.1
title: 'Scroll reader: hold the saved word after open (frame-aware stability)'
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
labels:
  - reader
  - bug
dependencies: []
modified_files:
  - apps/capacitor/src/pages/reader/use-anchor-hold.ts
  - apps/capacitor/src/pages/reader/top-edge.ts
  - apps/capacitor/src/pages/reader/scroll-view.tsx
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/use-scrub-progress.ts
  - apps/capacitor/src/pages/reader/__tests__/use-anchor-hold.test.tsx
  - apps/capacitor/src/pages/reader/__tests__/fine-scroll.test.ts
  - apps/capacitor/src/main.tsx
  - apps/capacitor/src/test-hooks/db.ts
  - apps/capacitor/src/test-hooks/reader.ts
  - apps/capacitor/e2e/tsconfig.json
  - apps/capacitor/e2e/helpers/framed-page.ts
  - apps/capacitor/e2e/helpers/novel-book.ts
  - apps/capacitor/e2e/helpers/seed.ts
  - apps/capacitor/e2e/helpers/storage.ts
  - apps/capacitor/e2e/position-reopen.spec.ts
  - apps/capacitor/e2e/position-late-resize.spec.ts
  - apps/capacitor/e2e/position-fling.spec.ts
  - apps/capacitor/e2e/position-hold-handback.spec.ts
  - apps/capacitor/e2e/position-settle-paragraph-start.spec.ts
  - apps/capacitor/e2e/reader-images-progress.spec.ts
  - apps/capacitor/e2e/scroll-mode-appearance-anchor.spec.ts
  - apps/capacitor/e2e/old-webview-notice.spec.ts
  - apps/capacitor/e2e/page-objects/reader.ts
  - apps/capacitor/e2e/types.d.ts
  - apps/capacitor/playwright.config.ts
  - apps/capacitor/package.json
parent_task_id: TASK-206
priority: high
ordinal: 179000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fixes the reopen drift seen at ~1 fps (TASK-206 step 0): scheduleFineScroll decides "stable" from scrollHeight sampled on 50 ms setTimeout ticks, so at a low frame rate it calls onReady a frame early and the next frame's virtua measurement shift is saved by handleScrollEnd.

Fix (in progress, lese-worker):
- After the initial reveal, start the TASK-205.8 relayout hook in its anchored phase with the seed word, held until real user input.
- Frame-count every "stable/quiet" decision (N consecutive rAF frames with unchanged layout; wall-clock only as an upper bound), including scheduleFineScroll.
- Keep the topVisibleWord sub-pixel slack and the content-based hasMoved.
- Migrate specs that simulate user scrolls with raw scrollTop writes to real input (wheel, keys, CDP touch).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 e2e/position-reopen.spec.ts 1 fps cases (uniform, novel) go red to green; 63 fps cases stay green
- [x] #2 An injector spec: a paragraph at the top edge growing after a reopen saves nothing and the held line returns to the top (63 fps and 1 fps; red before the hold reacted to content moves). After a reader's own scroll, a paragraph above growing saves nothing (a non-regression guard; a residual line of view drift outside a hold is accepted)
- [x] #3 Every spec migrated to real input still asserts the same saved words; the list of migrated specs is in the notes
- [x] #4 5 reopens on Morning Star in real Chrome save nothing without input (in the 1 fps automation window, and in a normal-rate window if available)
- [x] #5 Full capacitor e2e suite, vitest, tsc, biome and vite build pass; the 1 fps lane is tagged and kept lean
- [x] #6 A touch fling whose momentum stalls past VList's scroll-end debounce saves its real end and is never pulled back (e2e/position-fling.spec.ts, red with the settle hold)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 implementation (lese-worker), for review. AC#2 and AC#4 are partly met (see results).

use-relayout-anchor.ts:
- Frame-aware quiet: after QUIET_MS (300) it waits for QUIET_FRAMES (2) consecutive rAF frames with the target offset unchanged (budget 60 frames).
- holdAnchor(home: 'edge' | 'here') enters the holding phase without aiming.
  - 'edge': an align just sent the line to the top. Its scrollBy may not have landed when onReady fires; capturing then held the pre-align 174px and broke 13 appearance-anchor tests.
  - 'here': the current offset. After a settle the edge may cut a line, so the saved word sits a line lower.
  - onQuiet compares against homeRef; start() sets home 0.
- A ResizeObserver on the list's inner element arms quiet: text moving without a scroll event (a paragraph in view growing) was missed (red at 63fps).
- isOnTopEdge is [-2,4) with TOP_EDGE_SLACK_PX = 2.
- Any pointerdown in the list counts as held, released only by a scroll during the press (scrollbar, middle-click, a selection drag past the edge).

scroll-view.tsx:
- scheduleFineScroll counts frames: 3 unchanged frames of `scrollHeight:span top` (budget 36). The 4000ms timeout is only for a page with no frames.
- Holds: after an aligned open ('edge'); after a jump lands, both branches ('edge'); after every scroll-end settle ('here').
  - The jump hold is needed: at 1fps the TOC jump + Read from here window drifted lastWordRef through progress ticks, and the unmount flush saved it (44980 over 45066).
  - No hold after an open that did not align (word 0, empty book): a late cover or title must push the text down. A hold there scrolled the opening out of view and cancelled long presses.
- topVisibleWord returns {word, offset} with the 2px slack.
- Content-based hasMoved: settledTopRef records the top word and offset on every scroll end. The next settle compares that word's offset (+-4px), falling back to the scrollOffset rule when it is unmounted.

Beyond the planner's decision (please review): the jump and settle holds, the content RO, and the any-press rule. The 1fps seed flow and AC#2 need them; they follow 'view follows the saved word'. Known gap: a word tap doesn't update the hold anchor (as in TASK-205.8), so a late shift after a tap re-aims to the old anchor, without saving.

Specs:
- New: e2e/helpers/framed-page.ts (BeginFrameControl, shared), e2e/position-reopen.spec.ts (3 reopens by default, REOPEN_COUNT raises it), e2e/position-late-resize.spec.ts.
- The 1fps cases are tagged @lowfps (`--grep @lowfps`, or `--grep-invert` to skip).
- Migrated to real input (reader.wheel), asserting the same saved words:
  - position-settle-paragraph-start: scrollElementToTop now wheels the same floored delta. 'mid-paragraph' waits for the save before reading the top word, because the wheel lands asynchronously.
  - reader-images-progress: both figure scrollIntoView calls are now wheelFigureTo (same start/end alignment).
  - NOT migrated: position-end-of-book shiftScroller deliberately simulates a non-intent layout clamp (asserts no save; still true).
- scrollModeTopWord uses the 2px slack.
- Unit tests: 24 in use-relayout-anchor.test.tsx (rAF on the fake clock, a fake RO per target).

Results:
- position-reopen: 4/4 green. The 1fps cases went red to green.
- position-late-resize: 4/4 green.
  - 'cut after a reopen' was red at 63fps (39px) before the content RO.
  - 'above after a reader scroll' was never red: virtua compensates wholly-above items. My earlier '26px' was the cut-line geometry, not a shift, so that case asserts 'the line stays where it was', not 'on the top edge'.
- Full e2e 175/175 (24.1 min); vitest 1302/1302; tsc (app + e2e) clean; biome clean on touched files; vite build OK, no __lesefluss_e2e in the bundles.
- Real Chrome, 1fps window (rAF ~1000ms), Morning Star:
  - Chapter 19 TOC + Read from here: no settle afterwards (before: 47439).
  - 5 back/reopens: 0 saves, DB 47515 each time, line 1.19px from the top.
  - The only other save is unmount:47515, the same word (TASK-206.2).
  - A wheel then saved settle:47519.
  - No normal-rate window was available (AC#4 second half open).

Env incident: an orphaned Playwright webServer plus my :3045 vite shared node_modules/.vite, causing a mid-run dep re-optimisation (a 'useMemo' crash, 7 bogus timeouts). The orphan was killed by pid, and :3045 is stopped.

2026-10-26 review fixes (lese-worker; 3 reviewers, planner decisions).

Dropped: the hold after every scroll-end settle (the source of all three HIGH findings). handleScrollEnd only settles again.

Kept, with fixes:
- Holds after an aligned open and after a jump lands.
- holdAnchor(word) takes the word explicitly: the open's target, or jumpTo's wordIdx in both landing branches. getAnchorWord is now only for reflows.
- Read-aloud jumps hold their target. That can't ping-pong: while following, followWord is the only thing that scrolls, and it ends the hold before each scroll it makes.

Hook (renamed use-relayout-anchor -> use-anchor-hold.ts, useAnchorHold; the variable in scroll-view is anchorHold):
- In holding it never aims at an unmounted anchor. Unmounted, or moved further than the container height, means the reader scrolled it away (screen reader, find-in-page): hand back.
- aimsRef resets on every on-target quiet. Running out of aims ends the hold (idle), in both phases.
- No 'here' home any more (only the settle hold used it), so homeRef is gone.
- Pointer: mouse only. A press counts as scrolling on the list element itself (scrollbar), with the middle button, or after moving past 8px (selection drag). Release on window capture pointerup, pointercancel, contextmenu and blur, so the discussion marker's stopPropagation can't leave it stuck. A touch/pen pointercancel after a press in the list hands back (the browser took over panning).
- keydown on window capture; SCROLL_KEYS is Home and End only.

Shared top-edge.ts: TOP_EDGE_TOLERANCE_PX, TOP_EDGE_SLACK_PX, isOnTopEdge, scrollOntoTopEdge, offsetFromTop, listItemOf, and whenStill(read, onStill) -> cancel, with one constant set (3 still frames, budget 60) used by the hook's quiet and by scheduleFineScroll.

scheduleFineScroll:
- Uses whenStill.
- The 4000ms timeout is cleared on the first rAF, so it only covers frames stopping.
- For a headed chapter start (inline title), it aligns the paragraph item, the same target the hold keeps: no second landing on reopen.
- The phase comment is cut to one why.

exposeBookPositionRead moved to main.tsx bootstrap (DEV only). Item 10 (word-tap retarget) not done: optional and low impact.

Tests:
- Unit:
  - use-anchor-hold.test.tsx, 27 tests, grouped as reflow / holding / reader input. Covers explicit hold word (independent of getAnchorWord), consecutive-miss budget (7 corrected shifts), unreachable target let go, scrolled away past a viewport, unmounted anchor not aimed, sub-pixel slack, content move without a scroll event, unmount, touch pointercancel, scrollbar press vs click, selection drag vs press, middle-click, a non-bubbling pointerup, Home/End vs ArrowDown.
  - New fine-scroll.test.ts: at 1fps, aligns only after 3 still frames (not at 4s); aligns when frames stop after mount.
- New e2e/position-fling.spec.ts (HIGH a): CDP touch fling on a hasTouch BeginFrameControl page, frames at 200ms after touchEnd. Red before the fix: the fling reached scrollTop 2151 and the settle hold pulled it back to 464. Green now; the real end is saved.
- HIGH b/c: read-aloud is Android-only (IS_READ_ALOUD_SUPPORTED), so no web e2e. Covered by removing the settle hold, the explicit-word unit test, and the fling spec failing whenever any settle hold exists.
- e2e cleanups:
  - position-reopen stripped to its assertions (no probe, env knobs or console output); edge checks use isOnTopEdge from src.
  - framedPage is a fixture in helpers/framed-page.ts: project `use`, interval = frameMs, Playwright traces it, closed after the test.
  - reader.waitRevealed, reader.waitFramesIdle (late-resize waits it before reading the save log) and reader.wheelTargetTo (on the page object's scroll container) are shared. The migrated helpers use wheelTargetTo; reader-images-progress waits for the save after the top wheel.
  - stepUpAppearance exposed instead of the alias.
  - @lowfps excluded from the default run (grepInvert unless E2E_LOWFPS); `pnpm e2e:lowfps` runs it.
  - late-resize: the 'above after a reader scroll' case is relabelled as a guard (AC#2 reworded).

Results:
- tsc (app + e2e) clean; biome clean on touched files; vitest 1306/1306.
- Targeted (position-*, scroll-mode-appearance-anchor, jump-settle-guard, browse-mode, reader-images-*, including @lowfps): 68/68.
- Full default suite 172/172 in 20.2 min (the 4 @lowfps cases now run separately).
- vite build OK, no __lesefluss_e2e in the bundles.
- Real Chrome not re-run after these fixes.

2026-10-26 real-Chrome recheck after the review fixes (claude-in-chrome window at 1fps, rAF gaps ~1000ms; Morning Star, scroll mode, Georgia 26px, own vite on :3045, since stopped).

1. Wheel 5 ticks from 47519: settle:47621.
2. 5 back/reopens: no save of a new word. DB 47621 every time, line 1.25px from the top. The first back flushed unmount:47621 (the same word, after the wheel; TASK-206.2).
3. TOC jump to Chapter 22, then a wheel at +2.5s: the view returned to the chapter start (top word 55152), nothing saved.
   - At 1fps the landing takes several seconds, so the wheel arrived before it; the landing's align (and then the hold) put the view back on the target.
   - HEAD's landing align does the same, so this is pre-existing. A wheel during a landing could cancel the jump's fine align; not done.
   - A wheel after the landing moved the view (top word 55172), and it stayed.
   - Nothing saved, by design: a TOC jump enters browse mode, which commits only through Read from here or its auto-commit.
4. Read from here: browse:55172. A quick wheel straight after: settle:55223, which equals the top word.
5. Back, reopen, then A+ (26 -> 28px): no saves, DB 55223, line 1.13px. A- back to 26px: no saves, line 1.09px.

AC#4: the 1fps window passes; a normal-rate window is still not available.

2026-10-26 review round 2 fixes (lese-worker).

MAIN, scrolls nothing re-measured:
- While holding, a scroll that comes with no change in total size (scroller scrollHeight unchanged since the last scroll event or on-target quiet, and no content-RO callback in between) is someone else's: a screen reader, find-in-page, a focus move. It hands back.
- Our own align, smooth fine-align and corrections also come without a size change. They are let through by an own-scroll window from the hold start (and from each correction) until the word is next found on the edge after a quiet, i.e. at least 300ms after the last scroll of a smooth align. That is what 'arm only after the smooth fine-align' means here; onReady timing is unchanged.
- The content RO now only marks the size change and re-arms quiet (noteResize); it no longer counts as a scroll.
- focusin inside the container hands back.
- MAX_CORRECTIONS 20 per hold.

Smaller items:
1. blur is registered on window without capture, so only the window's own blur releases a press.
2. Native scroll keys (Space, PageUp/Down, arrows, Home, End) are stamped from a window bubble listener when not defaultPrevented (the shortcuts handler preventDefaults what it consumes) and the target is the page or inside the text, not a field or an overlay. The window lasts until the next scroll event consumes it, or 2000ms (about 2 frames at 1fps; a key that scrolled nothing is let go).
3. Middle-click autoscroll is kept until the next pointerdown, keydown or wheel.
4. A scrollbar press also needs e.offsetX >= scroller.clientWidth (a drag past 8px still counts anywhere).
5. INIT_SETTLE_COOLDOWN_MS applies only to opens without a hold (word 0 / empty book). New option onReaderInput: when the hold ends for reader input, scroll-view clears the suppress flags. The open's suppressed scroll end was still due and swallowed the reader's first scroll; found by the new e2e.
6. No jump hold at word 0 or at a paragraph start with leading figures.
7. index.tsx handleScrollPositionSettle: read-aloud detaches only when hasMoved.
8. A touch pointercancel only marks the touch; a scroll that follows hands back, and a long press (no scroll) keeps the hold. Not device-checked on Chrome Android.
9. expectHeld doc fixed.
   - New e2e/tsconfig.json (ES2023 lib, includes src/vite-env.d.ts), wired into `check-types`.
   - Correction: my earlier 'tsc e2e clean' was wrong. That scratch config had types:['node'] (@types/node is not installed) and my grep filtered the error out.
   - Real e2e type-check now: clean after fixing a pre-existing error in old-webview-notice.spec.ts.
10. TASK-205.8 modifiedFiles and TASK-206 references updated through the MCP; doc-7 untouched.
11. Comment noise cut; 'via scrollIntoView' fixed.

Not applicable: 'focus a link and press ArrowDown'. Links in the text render as word-link spans (not <a>), so nothing in the text takes focus; focusin is covered by a unit test.

Tests:
- Unit: use-anchor-hold.test.tsx 34. New: foreign scroll handed back; the align's own scroll let through; a correction's own scroll not foreign; compensation-sized shift WITH a size change corrected; 20-correction cap; focusin; scrollbar offsetX vs margin; press kept through an element blur; middle-click after pointerup; native key window at 1.5s; consumed or field keys ignored; touch pointercancel vs long press; onReaderInput on a wheel but not on a cancel.
- New e2e/position-hold-handback.spec.ts:
  - a programmatic scrollTop += half a viewport during the open hold is saved and not pulled back. Verified red with the foreign rule disabled, then the file restored.
  - a wheel right after the reveal is saved. Red until the onReaderInput fix.

Results:
- tsc app + e2e clean; biome clean (only pre-existing infos in index.tsx/live-board.tsx); vitest 1313/1313.
- Targeted (position-*, appearance-anchor, jump-settle-guard, browse-mode, reader-images-*, toc/search jump, @lowfps): 71/72, then green after the fix.
- Handback spec repeat-each=3: 6/6.
- Full default suite 174/174 (4 workers, 5.3 min).
- @lowfps lane 4/4 (4.5 min).
- vite build OK.

2026-10-26 review round 3 (lese-worker). Simplified rather than adding flags.

HIGH 1: touchCancelledRef and touchPressed removed entirely. A pan is handed back by touchmove past TOUCH_SLOP_PX, and a long press keeps the hold. A pan before a hold (popover, TOC) no longer ends it.

New classification rule, replacing the size-change rule (lastScrollHeightRef, contentResizedRef and noteResize's flag are gone). Each scroll event while holding compares the held word's offset change ('moved') with the scrollTop change ('scrolled') since the last scroll event:
- moved ~ -scrolled (the text moved with the scroll, |moved+scrolled| < 1.5px, |scrolled| >= 1): someone else's scroll, released as 'others';
- moved ~ 0: VList compensation, ignored;
- otherwise a layout shift, re-aimed at the next quiet.
- Own scrolls: the landing align (until the word is first on the edge after a quiet) and the px of corrections we issued (ownDeltaRef, consumed by scroll events in the same direction).
- A word unmounted or more than a viewport away is 'others' too, but only after own scrolls are checked, so a smooth jump/follow never trips it.
- The read (classify) is separate from the state update in noteScroll.
- The content RO only re-arms quiet.

Other items:
2. One release(reason) call replaces cancel/yieldToReader: 'reader' | 'others' | 'programmatic'. handle.scrollBy (the reader's keys, page buttons) releases as 'reader'; jumpTo and followWord as 'programmatic'.
3. onReaderInput fires only for 'reader': not for a foreign scroll, focusin, the budget, or a jump.
4. One readerInputUntilRef replaces pointerHeldRef, autoscrollRef and scrollKeyAtRef: Infinity while a scrollbar press, selection drag or middle-click autoscroll is active; now+2000ms after a native scroll key, consumed by the next scroll. begin() resets it. Autoscroll ends at any window-capture pointerdown, keydown or wheel.
5. Done through the classify order above.
6. One budget per hold, MAX_CORRECTIONS 12 (misses included; nothing resets it), plus MAX_BUSY_MS 10s of activity without a quiet. MAX_AIMS is gone.
7. Nits applied. Touch hand-back rules have unit coverage only; the device check is deferred to the TASK-206 parent's Pixel pass.

Also found and fixed (TASK-208 flake, real app bug): src/pages/explore/search-field.tsx. Pressing Clear blurred the field (150ms hide timer), then refocused it without clearing the timer, so 'Recent searches' hid while the field had focus. Before: 2/12 and 5/12 failures under 4 workers. After: 24/24. New unit test search-field.test.tsx, red without the fix.

Tests:
- Unit: use-anchor-hold.test.tsx 39, rewritten on a harness that moves scrollTop and the word together. New cases: net-zero compensation ignored; a foreign scroll with a resize further down handed back; the landing align's own far scroll let through; a stale pan before a hold doesn't end it; a press from before the hold forgotten; autoscroll ended by the next click; budget 12; busy cap; onReaderInput only for the reader.
- e2e position-hold-handback: new case 'a page key right after the text appears is saved'. Red with scrollBy releasing as 'programmatic'; file restored.

Results:
- tsc app + e2e clean; biome clean; vitest 1320/1320.
- Handback spec repeat-each=2: 6/6.
- Full default suite 175/175 (4 workers, 5.4 min), after a run that hit only the explore-browse flake.
- @lowfps 4/4.

2026-10-26 real-Chrome recheck after round 3 (claude-in-chrome window at 1fps, rAF ~1000ms; Morning Star, scroll mode, Georgia 26px; own vite :3045, since stopped).

1. Wheel 5 ticks from 55223: settle:55319, equal to the top word.
2. 5 back/reopens: no new word saved. DB 55319 each time, line 1.41px from the top. The first back flushed unmount:55319, the same word (TASK-206.2).
3. Find-in-page right after a reopen.
   - Real Ctrl+F could not be driven: the extension's key events go to the page, not to Chrome's find bar. The typed 'r' toggled RSVP. That detour saved only the same word (rsvp:55319, rsvp-exit:55319); I switched back.
   - window.find('grappling') selected the match but did not scroll the nested list.
   - Stand-in used: scrollIntoView({block:'center'}) on the match 'grappling' (1208px down, just below the fold). That is a native scroll with no input event, the same signal as find-in-page or a screen reader.
   - Result: the list scrolled 653px and saved settle:55433, the new top word; 'grappling' stayed mid-screen (555px), no snap back.
   - Back: unmount:55433, DB 55433.
4. TOC jump to Chapter 23, Read from here: browse:57417. A quick wheel right after: settle:57422, equal to the top word.
5. Back, reopen, then A+ (26 -> 28px): no saves, DB 57422, line 1.59px. A- back to 26px: no saves, line 1.78px.

AC#4 checked per the planner's decision: the 1fps real-Chrome evidence plus the normal-rate headed-Chromium and 63fps e2e evidence is accepted for 206.1. The normal-rate device check moves to the TASK-206 parent's Pixel pass.

2026-10-26 review round 4 (lese-worker).

1. MEDIUM: classify now tests compensation first (|moved| < 1.5px), and 'others' needs |scrolled| >= 3px with |moved+scrolled| < 1.5px. Unit test: compensate(1), compensate(1.4), and scrolled 2 / moved -0.6 keep the hold; compensate(37) too.
2. The landing window ends at the first quiet, whatever the target. A correction whose scroll never comes (ownDeltaRef still set at the next quiet, clamped at the end of the book) sets stuckRef: the hold stops correcting and only classifies, so a later foreign scroll is still released. Unit-tested.
3. ownDeltaRef is reset at every quiet before a new correction.
4. A 'with the scroll' move within 150ms of a consumed own delta AND of a content resize counts as a shift (re-aim), not someone else's. Unit-tested.
5. scroll-view: clearIfJumpDidNotScroll (hoisted above markInitialSettled) also runs after an aligned open. An align clamped at the end of the book no longer leaves the suppress flag set to swallow the reader's first scroll.
6. The viewport-distance rule is dropped. A far move no scroll explains (a tall figure loading above the word) is a shift to correct; someone scrolling it far still matches the with-scroll rule, and unmounted is 'others'. Unit-tested both ways.
7. The native-key check runs in setTimeout(0), after every listener, so defaultPrevented no longer depends on registration order. The unit test now consumes with a bubbling listener added after the hook's.
Known limitation (documented, harmless): a Linux middle-click paste counts as autoscroll input; the content-based hasMoved blocks the save.

Harness flake found (framed specs under 4 workers): the Read from here click waited seconds for the browse bar to be stable, and the 10s waitForNextSave window, started before the click, ran out. Fix: reader.commitReadFromHere takes the save baseline, clicks, then waits for a save above it. Used in position-reopen and position-late-resize. Alone, the failing case had passed 6/6.

Results:
- tsc app + e2e clean; biome clean; vitest 1324/1324.
- Targeted (position-*, appearance-anchor, jump-settle-guard, browse-mode, reader-images-*, toc/search jump, reading-goal, @lowfps): 77/78 before the harness fix (the flake above).
- After it, 3 consecutive full default runs: 175/175 each (310-311s).
- @lowfps 4/4 (100s).
- vite build OK, no hooks in the bundles.

2026-10-26 lese-planner: accepted after 4 review rounds (each with 2-3 independent reviewers; final round: verifier READY, red team no HIGH, final small batch applied). Final checks: 3 consecutive full default runs 175/175 at 4 workers, @lowfps 4/4, tsc app+e2e clean, biome clean, vitest 1324/1324, vite build OK. Real Chrome (1 fps window) rechecked after each round. AC#4 accepted on 1 fps real-Chrome + normal-rate headed Chromium + 63 fps e2e evidence; normal-rate device check moved to the TASK-206 parent's Pixel pass (TASK-206 AC#5).
<!-- SECTION:NOTES:END -->
