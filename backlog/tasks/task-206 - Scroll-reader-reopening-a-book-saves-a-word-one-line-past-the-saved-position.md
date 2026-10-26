---
id: TASK-206
title: 'Reader position: fix the confirmed save bugs'
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
labels:
  - reader
  - bug
milestone: m-13
dependencies:
  - TASK-205.8
references:
  - apps/capacitor/src/pages/reader/scroll-view.tsx
  - apps/capacitor/src/pages/reader/use-anchor-hold.ts
  - apps/capacitor/src/pages/reader/top-edge.ts
documentation:
  - backlog/docs/doc-4 - Reader-position-save-on-intent-design-reference.md
  - >-
    backlog/docs/doc-5 -
    Reader-position-save-on-intent-design-reference-—-part-2.md
  - >-
    backlog/docs/doc-6 -
    Reader-position-save-on-intent-design-reference-—-part-3.md
  - >-
    backlog/docs/doc-7 -
    Reader-position-save-on-intent-design-reference-—-part-4.md
modified_files:
  - apps/capacitor/e2e/helpers/novel-book.ts
  - apps/capacitor/e2e/position-reopen.spec.ts
  - apps/capacitor/e2e/types.d.ts
  - apps/capacitor/src/test-hooks/db.ts
  - apps/capacitor/src/test-hooks/reader.ts
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/use-scrub-progress.ts
priority: high
ordinal: 180000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reading-position saving must never fail. After a full inventory, a reviewed refactor design (backlog document "Reader position: save-on-intent design (reference)") and a verification pass, the owner chose TARGETED FIXES (2026-10-26). Each bug confirmed at normal frame rate gets its own subtask, with its reproduction spec as a red→green regression test. The full refactor stays as reference.

Confirmed bugs (reproduced at normal frame rate unless noted):
1. Sync clobber: the open reader ignores a newer pulled position, and the next flush overwrites it with the stale local word and a newer stamp (multi-device progress loss).
2. Page mode: a page turn within ~1.5-2 s after a TOC/search jump is not saved; "Read from here" commits the jump target.
3. Scroll mode: a TOC jump to a heading chapter lands with the previous chapter's last line at the top and saves that word (floored chapter/paragraph start).
4. RSVP: a word-index refetch (sync pull, chapter fetch) rewinds playback to the entry word, and it is saved.
5. Background flush re-stamps an unchanged word with a fresh revision on every app switch / tab hide.
6. Paused read-aloud: scrolling while paused saves nothing; leaving saves the last spoken word (code-confirmed, Android-only).
Plus: the reopen drift that appears only at ~1 fps (scheduleFineScroll decides "stable" on timers), fixed by the post-open hold with frame-aware stability.

Repro specs (to be ported into the repo by the subtasks): scratchpad repro-v1/apps/capacitor/e2e/repro-page-turn-after-jump.spec.ts, repro-scroll-toc-heading-landing.spec.ts, helpers/repro-novel.ts; repro-v2/apps/capacitor/e2e/repro-position-bugs.spec.ts with test-hooks/db.ts. The 1 fps BeginFrameControl harness is in the repo working tree (e2e/position-reopen.spec.ts).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every subtask is Done: each confirmed bug has a regression spec that was red before its fix and is green after
- [x] #2 The 1 fps reopen spec is green; 5 reopens on Morning Star in real Chrome save nothing without input
- [x] #3 Owner decisions recorded in the notes are honoured where they apply (adopt + Undo toast for a newer pulled position while idle; inverse Go-there toast when local is kept; read-aloud stop while detached saves the spoken word)
- [x] #4 Full capacitor e2e suite, vitest, tsc, biome and vite build pass; Android build succeeds
- [x] #5 Pixel device pass (normal frame rate, touch): 5 reopens save nothing without input; fling saves its real end; font change after reopen saves nothing; TOC jump + read; long press keeps position (covers the deferred normal-rate checks from 206.1 AC#4 and the touch hand-back rules)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 investigation (real Chrome, HEAD :3042, virtua 0.48.8 sources): there is NO periodic re-render. Idle: 0 ScrollView/VList renders in 6s. On open: 3 renders in ~1.2s (mount, isInitialScrollReady flip + parent activeWord change, activeWord again); footer={advanceFooter} is a fresh element every BookReader render and ScrollView is not memoised (worth fixing for cost, not a fix). The shifts are virtua scroll-jump compensation: never-measured items above the viewport (~1400 paragraphs at word 45k sit at the estimate) mount for the first time as the 200px buffer is toggled by scroll direction, and ACTION_ITEM_RESIZE + _fixScrollJump rewrite scrollTop in a layout effect, without a React render. They pass MIN_SETTLE_SCROLL_PX because that compares scrollOffset. Fractional item heights plus scrollTop rounding then leave the line a sub-pixel above the edge, and topVisibleWord skips it, which explains the one-line drift.

Suggested fix: (1) make handleScrollEnd's hasMoved content-based: record the settled span's offset from the top at each settle; on the next scroll end, if that span is still mounted within +-MIN_SETTLE_SCROLL_PX of its recorded position, it is not a move, regardless of scrollTop. (2) Give topVisibleWord a ~1-2px negative tolerance. To decide whether that is enough, log the settled span's top before and after one compensation jump in real Chrome (serif/2.0/28/28, 1100px): if it stays within ~1px, (1) is enough; if it moves by a line, an item cut by the top edge is resizing and a re-aim is still needed. If it works, evaluate shrinking TASK-205.8's holding phase. virtua sources extracted to the session scratchpad (core__store.ts, core__scroller.ts, react__Virtualizer.tsx).

2026-10-26 owner: approved the 'save only on user intent' refactor; it must be bulletproof with tests for every case. Process: independent multi-agent review at every phase; the plan/design itself is reviewed by independent agents for whether it is the right approach before implementation starts. 205.1/205.2/205.3 wait for this refactor. TASK-162/187 parallel work deferred by owner. Inventory phase started (3 independent read-only agents: scroll/core, page/RSVP/TTS/BLE/sync, bug history + coverage + harness).

2026-10-26 case-matrix input (real Chrome, Morning Star): a TOC jump to 'Chapter 22: The Weight of Ares' lands with the chapter heading ~184-214px below the top edge (the previous chapter's last lines visible above), at HEAD and in the 205.8 tree alike. Then 'Read from here' saves 55121, the last line of chapter 21, not the heading word 55146. Expected: a chapter jump lands with the heading at the top and commits the heading/first word of the chapter.

2026-10-26 design phase: design doc written (scratchpad t206/design.md) and reviewed by 3 independent agents (architecture: approve with changes; feasibility: 3 assumptions refuted with fixes; red team: 20 failure modes, 2 critical). Owner decisions: Q1 sync-pulled newer position while idle -> adopt + smooth jump + Undo toast; Q2 read-aloud stopped while detached -> saved = spoken word, view becomes browse (Back / Read from here); Q6 ship the hotfix first (topVisibleWord sub-pixel tolerance + content-based hasMoved), gated on a red reopen spec + 5-reopen real-Chrome check; extra scope IN TASK-206: Android kill durability (native sync mirror + background task on pause), read-aloud screen-off native position persistence, web multi-tab single active reader tab. BLE revision semantics OUT (separate follow-up task; keep furthest-wins routed through the gate, documented exception).

2026-10-26 design v2 (scratchpad t206/design-v2.md) addresses all review findings; second review round running (fresh red team + coherence/review-response audit). Owner decisions on v2 open questions: O1 second web tab shows a takeover screen ('open in another tab' + 'Use here'), no DB in the inactive tab; O2 page mode turning onto a figure-only page saves a position that reopens on the figure page itself (anchor = figure's paragraph); O3 adopt Undo toast 10 s, a second adopt replaces it and Undo returns to the pre-first-adopt position.

2026-10-26 design v3 (t206/design-v3.md). Owner decisions: O4 resuming read-aloud after the reader moved while paused restarts the voice at the reader's current word; O5 show the inverse toast 'Newer position from another device · Go there' when local is kept over a newer different external (cold-start special rule stays rejected); O6 accepted G2 exceptions E1 (foreign scroll < 0.5 vh without attributable input), E2 (input during initial landing ignored), E3 (closed-book queued write loses to a newer DB row), E4 (BLE furthest-wins until TASK-207). E5 is NOT accepted: per the earlier O2 decision, a figure-only page must reopen on the figure page itself. E6 (write wedged past the watchdog reaches the DB at next app start via reconcile) is a durability detail, not a loss. O1 and O3 were already decided (takeover screen, no DB in the inactive tab; toast 10 s, a newer toast replaces the older one).

2026-10-26 round-3 reviews: readiness audit 'ready after small edits'; fresh red team found no critical issues (4 high, all with fixes). Owner decision: figure-only pages use a DEVICE-LOCAL hint {bookId, rev, figureId}: the saving device reopens exactly on that figure page (also with several figure pages in a row, settles O7); findPageForWord stays span-based, so text pages, jumps and read-aloud follow behave as today; other devices land on the text page after the figure. This replaces the v3 §4.5 global figure-anchor rule.

2026-10-26 owner: Android kill durability = native mirror written with SharedPreferences.commit() before the DB write, proven by force-stop timing tests (0.3/1/3/6 s); a fully synchronous native write is the fallback if any test fails. The 'background task on pause' is dropped (Android has no mechanism that survives swipe-kill/force-stop).

2026-10-26 STEP 0 (repro gate) result: RED headless, but the trigger is the FRAME RATE, not paragraph-length variance.

Harness added (no product behaviour change):
- e2e/helpers/novel-book.ts: seeded PRNG (mulberry32), 2500 paragraphs (65% 8-30, 30% 80-200, 5% 400-900 words), split into two chapter files at about word 45k, because the importer drops TOC fragments (epub.ts:227). `uniform` option = every paragraph 87 words (the mix's mean), as the control.
- Save log: savePosition/writePosition take a SaveSource tag (settle, jump, word-tap, scrub, browse, rsvp, rsvp-exit, read-aloud, recovered, unmount, pagehide). __lesefluss_e2e_save carries `source`; __lesefluss_e2e_saveLog is append-only.
- __lesefluss_e2e_readBookPosition(id) (test-hooks/db.ts, exposed DEV-only from reader/index.tsx; it can't live in books.ts because node-env vitest loads that module).
- e2e/position-reopen.spec.ts: seed = TOC jump, Read from here, 4s idle; then 5 in-app back/reopens and 5 page.goto reopens, 4s idle each. Asserts the DB word, no save of another word, and the saved word's line in [-2,4)px. Probe logs scroll/scrollend/reveal. Fractional CSS (17.3px font, line-height 1.37). Runs at 63fps and 1fps by issuing frames through CDP BeginFrameControl (launchPersistentContext with --enable-begin-frame-control --run-all-compositor-stages-before-draw, Target.createTarget enableBeginFrameControl, HeadlessExperimental.beginFrame pump). REOPEN_EPUB/REOPEN_EPUB_TITLE/REOPEN_EPUB_CHAPTER add a real book; REOPEN_METRICS=0 drops the CSS.

Matrix, first spec version (normal frames, 10 reopens each, all GREEN, 0 scroll events after the reveal, DB word unchanged):
- {novel, uniform} x {headless-shell, channel:chromium, headed bundled Chromium, headed system Chromium 153 (no Google Chrome installed; stands in for channel:chrome)} x {CPU 1x, 4x}: 16/16 green.
- Morning Star EPUB headed system Chromium, with and without fractional CSS: green (47515 held).

Real Chrome via claude-in-chrome (:3045, Morning Star, Georgia 26px, line 2): RED. Read from here saved 47515, then a no-input `settle` saved 47439. Reopens: settle 47342, then the unmount flush carried on to 47153. Key observation: that window paints about once a second (rAF gaps of ~1000ms) while visibilityState is 'visible' and setTimeout keeps real time (an occluded automation window). The planner's 45046 -> 45076 -> 45090 was most likely the same condition, which a slow device (Boox e-ink, a loaded Android) can share.

BeginFrameControl (headless-shell, 1 frame/s, timers real time), deterministic over 2 runs each:
- novel 63fps: green (45157 held).
- uniform 63fps: green (45066).
- novel 1fps: RED. Committed 44909; reopen 1: settle 44763; then stable.
- uniform 1fps: RED every reopen, one line back each time: 45046 -> 45034 -> 45020 -> 45007 -> 44996.
So the median-estimate hypothesis is refuted: the uniform control drifts too.

Mechanism (trace, uniform 1fps): scrollToIndex lands at 95741, the fine-align scrollBy goes to 95858, reveal. At +926ms the next frame fires a scroll event with the SAME scrollTop while the content has moved a line (virtua applying its pending measurements). That is past INIT_SETTLE_COOLDOWN_MS (500), so handleScrollEnd saves the line now on top. Root: scheduleFineScroll (scroll-view.tsx:136-159) decides 'stable' from scrollHeight sampled on 50ms setTimeout ticks. At 1fps no layout lands between samples, so it aligns and calls onReady before the frame that applies the measurements. All open guards are wall-clock, while scroll and RO delivery are frame-bound.

Consequence for STEP 1: the planned content-based hasMoved would see the settled span displaced by a full line (>=4px) and still save, and the -2px slack does nothing for a whole-line shift. So the hotfix as designed will not turn this spec green. Needed instead (to decide): frame-aware stability (count rAF frames, not timer ticks) and/or verifying the anchor over N frames after the reveal, re-aiming instead of saving (TASK-205.8-style hold on open).

scrollend probe (headless 60fps, wheel 12x100px at 40ms with a programmatic scrollTop += 37 mid-series): headless wheel is not smooth, so every tick gives scroll+scrollend in the same frame; the programmatic jump got no scroll/scrollend of its own and coalesced into the next frame's scroll. The mid-fling question for real smooth scrolling stays OPEN: it needs real Chrome at 60fps, and my automation window runs at 1fps. The reader's settle uses virtua's onScrollEnd (150ms debounce), not native scrollend.

Checks: capacitor tsc clean; vitest 1294/1294; biome clean on touched files. The spec is red at 1fps by design (the gate); 63fps cases green. Runtime about 1.5-3 min per case (4 cases).

2026-10-26 owner: the reopen drift reproduces only at ~1 fps (worker step 0), so normal-use impact is unproven. Decision: VERIFY FIRST. Step 1 (post-open hold + frame-aware stability) proceeds; in parallel each code-reading bug is reproduced at normal frame rate (page turn after jump, TOC landing, background flush re-stamp, sync clobber, RSVP rewind; paused-TTS by code trace; BLE rounding not reproducible without hardware). Then the owner chooses targeted fixes vs the full refactor. The final design (t206/design-final.md) is complete but NOT yet published or split into subtasks pending that decision.

2026-10-26 verify-first results (agent 2, HEAD copy, normal frame rate, 3/3 runs each, spec scratchpad repro-v2/apps/capacitor/e2e/repro-position-bugs.spec.ts):
- CONFIRMED background flush re-stamp: visibilitychange hidden x3 + pagehide with no movement rewrote word 99 five times with new updatedAt/lastRead (writePosition has no same-word short-circuit; updateBook stamps updatedAt).
- CONFIRMED sync clobber: a pulled newer remote position (499, via the real buildBookMergeUpdate + updateBook) is ignored by the open reader; the next visibility flush or back/unmount flush rewrites the stale local 99 with a newer stamp, so the remote position is lost. updateBook has no 'don't go backwards' guard.
- CONFIRMED RSVP rewind: invalidating ['books'] or the word-index query while RSVP plays resets the display to the entry word and the next pause saves it (99 after 106 was saved); control invalidation (book-covers) does not. Cause: use-rsvp-engine words effect keyed on [content, bookWordIndex] resets to initialWordRef without clearing the timer.
- CODE-CONFIRMED paused read-aloud: status 'paused' counts as active, so settles call detach and return; ticks are ignored; flushes save the last spoken word; the scrolled-to spot is lost unless play is pressed.

2026-10-26 verify-first results (agent 1, HEAD copy, normal frame rate, 3/3 runs, specs scratchpad repro-v1/apps/capacitor/e2e/repro-page-turn-after-jump.spec.ts and repro-scroll-toc-heading-landing.spec.ts):
- CONFIRMED page mode turn lost after a jump: a turn ~1.5-2 s after a TOC/search jump (incl. after Read from here, and a jump to the current word) is not saved; back/reopen lands on the jump page. Worst case: jump, turn while browsing, Read from here commits the jump target, not the page on screen. Cause: JUMP_SETTLE_GUARD_MS isJumpSettle early return in handleScrollPositionSettle also applies in page mode and never updates lastWordRef. Control (turn after 1.8 s past Read from here) saves correctly.
- CONFIRMED scroll TOC jump to a heading chapter: lands with the previous chapter's last word at the top and the heading ~69 px down; Read from here saves the previous chapter's last word (2489 instead of 2490). 24/24 cases (h1/h2, two chapters, two viewports). Cause: floor in two places: paragraphStartWords (index.tsx wordIndex.wordOf of the heading paragraph's '#' byte) and the TOC chapter startWord (queries/books.ts wi.wordOf(ch.startByte)). jump-settle-guard.spec.ts masks it (accepts saved >= openingWord - 5).
Summary: 6 position bugs confirmed at normal frame rate (re-stamp, sync clobber, RSVP rewind, page turn after jump, TOC heading landing, paused read-aloud by code); reopen drift only at ~1 fps; BLE rounding unverified (no hardware).

2026-10-26 reference design published as backlog docs doc-4..doc-7 (parts 1-4, verbatim from the final reviewed design). doc-6/doc-7 were copied into backlog/docs directly (owner-approved) because the MCP document tools kept getting cut off on the size.

2026-10-26 repro specs preserved in apps/capacitor/e2e-repro/ (outside the Playwright testDir and tsconfig include): repro-position-bugs.spec.ts (206.2/206.5/206.7, needs test-hooks/db.repro.ts), repro-scroll-toc-heading-landing.spec.ts (206.3), repro-page-turn-after-jump.spec.ts (206.4), helpers/repro-novel.ts. The scratchpad paths in the subtask descriptions are temporary; use these. Each subtask ports its spec into e2e/ and deletes it from e2e-repro/.

2026-10-26 lese-planner: all 7 subtasks Done, each bug with a red-before/green-after regression spec. Final tree: full e2e 238/240 with E2E_WORKERS=2 (2 setup timeouts green on rerun), @lowfps 4/4 (the 1 fps reopen spec), vitest 1398 + core 195, web 316/316 on a throwaway local DB, tsc + biome clean, vite build + Android assembleDebug OK. Pixel 8 Pro passes on the working tree (normal frame rate, touch; In Search of Lost Time, DB over adb run-as): earlier pass (fling → browse → Read from here saved its end; TOC jump + read; A+/A- after reopen saved nothing; read-aloud cases incl. sleep timer) and a final pass on the 206.7 build: 5 reopens saved nothing (same word and offset), long press selected a word and kept the position. Real Chrome: 206.1 reopen checks and the 206.7 toasts. Owner decisions honoured as recorded. Follow-ups: TASK-207, 209, 210, 211, 212 (m-14). Test book reset to word 0; the owner's current book untouched (same position and timestamp).
<!-- SECTION:NOTES:END -->
