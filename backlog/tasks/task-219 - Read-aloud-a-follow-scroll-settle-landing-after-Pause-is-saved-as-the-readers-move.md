---
id: TASK-219
title: >-
  Read-aloud: a follow-scroll settle landing after Pause is saved as the
  reader's move
status: Done
assignee: []
created_date: '2026-10-26 02:01'
updated_date: '2026-10-27 01:10'
labels:
  - reader
  - bug
  - read-aloud
milestone: m-13
dependencies: []
modified_files:
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/scroll-view.tsx
  - apps/capacitor/src/pages/reader/use-anchor-hold.ts
  - apps/capacitor/src/pages/reader/view-types.ts
  - apps/capacitor/e2e/read-aloud-position.spec.ts
  - apps/capacitor/e2e/page-objects/reader.ts
priority: low
ordinal: 192000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while stabilising the TASK-218 Back e2e (2026-10-26). Resume read-aloud when the voice's word isn't where the view would put it (e.g. after browse Back): the view scrolls to follow the voice. If the user pauses before that scroll comes to rest (within ~1 s), its settle arrives while paused, so the reader "takes over" and saves the view's top word.

Repro, 1 in ~4 runs: in e2e/read-aloud-position.spec.ts "browse's Back makes play read from where it went back to", remove the waitPositionQuiet after the resume. The voice saves 34, then a `settle` saves word 0 (the start of the paragraph holding 34), about 200 ms after the pause save. The saveLog shows read-aloud 34 followed by settle 0, and the settleLog has no other settle in between.

Effect: the position goes back to the top of the view (here 34 words). It's minor but silent.

Likely fix: treat a settle of the voice's own follow scroll as a jump settle (stampJump on the follow scroll), or ignore settles that come within the follow scroll's window after a pause.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In scroll mode, a settle while the view still follows the voice is never a reader move: paused, nothing is saved; playing, the view keeps following
- [x] #2 Red-before / green-after e2e
- [x] #3 The TASK-218 read-aloud tests no longer need a quiet wait before pausing
- [x] #4 Reader scrolls that index.tsx doesn't detach at input time (Space, native keys with focus in the text, scrollbar press, middle-click autoscroll, a selection dragged past the edge) still count as the reader's move
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-27 lese-worker:

Root cause: handleScrollPositionSettle took any settle with hasMoved and no jump guard as the reader looking elsewhere. The voice-follow scroll's own scroll end is meant to be swallowed by the single-shot suppressNextScrollEndRef, but that flag can be cleared before the animation's real end. Likely culprit: clearIfJumpDidNotScroll clears it when no scroll event arrives within 2 frames, and a sub-pixel or zero first tick produces none. The end then arrives as a reader settle. Paused, the reader takes over and saves the view's top word. Playing, the view silently detaches from the voice. I didn't pin the exact clearing path (rare and timing-dependent; CPU throttling and a mid-animation long task didn't reproduce it), so the fix doesn't depend on it.

Fix (pages/reader/index.tsx): in scroll mode, a settle while isFollowingVoiceRef is true is the view's own scroll, not a reader move. Real reader input (wheel, touch drag, scrollbar press, scroll keys) already stops following at input time via keepsPositionOnMove(null), before its scroll settles. Page mode is excluded: a key page turn there detaches only through its settle, and page-mode follows report no settle. With ttsFollow off, isFollowingVoiceRef is false, so behaviour is unchanged.

Tests (read-aloud-position.spec.ts), using the new page object reader.scrollWithoutInput (scrollTop from script, no input):
- "paused while following the voice, a scroll the reader didn't make saves nothing": red before (99 saved instead of 29); after the fix, resume carries on with the same session at spoken+3.
- "playing, a scroll the reader didn't make keeps the view following the voice": red before (the detached row appeared).
Red check: reverting the condition makes both fail (2/2); restored and cmp-verified.

The TASK-218 Back and Undo-while-playing tests no longer wait before pausing: 24/24 at repeat 8, and 30/30 together with the new tests at repeat 6 (before, about 1 in 8 failed). An intermediate version without the scroll-mode limit broke the two page-mode read-aloud tests; the final version passes read-aloud-position + browse-mode + position-external/fling/reopen 50/50. tsc clean.

2026-10-27 lese-planner: review (2 reviewers, no HIGH; follow state never sticks: read-aloud off skips the block). MEDIUM: Space (and middle-click autoscroll, selection drag past the edge, native keys with a focused link) bypass the index.tsx input-time detach and are now swallowed as a view scroll while following. Planner decision: one input model: reuse use-anchor-hold's reader-input signal (readerInputUntilRef / NATIVE_SCROLL_KEYS) for the view-scroll test instead of the duplicate SCROLL_KEYS list. Plus: restore the spoken-word underline after a swallowed settle while paused; harden the playing e2e. Root cause of the early-cleared suppress flag goes to TASK-217.

2026-10-27 lese-worker, review follow-up (MEDIUM: Space swallowed):
- One input model. use-anchor-hold exports NATIVE_SCROLL_KEYS (includes " ") and exposes isReaderInput() (readerInputUntilRef: press, middle-click autoscroll, selection drag past the edge, native scroll keys).
- The scroll view's scrollBy (keyboard shortcuts and page buttons, including Space) opens a 1 s reader-scroll window. The handle exposes isReaderScrolling() = that window || anchorHold.isReaderInput().
- index.tsx: the view-scroll test is now isReconcilingJump() || (scroll mode && following && !isReaderScrolling()). The input-time detach uses NATIVE_SCROLL_KEYS; its duplicate SCROLL_KEYS list was dropped.
- A swallowed view-scroll settle where the voice owns the position restores activeWord/progress to the spoken word.
- view-types' followWord doc no longer claims every settle while following is the user's.

Tests:
- "paused while following the voice, scrolling on with Space / ArrowDown saves where the reader went" (top word saved).
- The playing test now speaks after the scripted scroll and asserts the spoken word's line is back on screen (0 ≤ offset < 70% of the height) with no detached row.

Red checks:
- Both new paths reverted (isReaderScrolling clause + Space key detach) → Space is red. Either path alone is enough.
- The 219 guard reverted → the playing test is red.
- All restored + cmp.

The root-cause note (suppress flag cleared early: virtua's 150 ms debounce mid-animation, clearIfJumpDidNotScroll after a zero first tick, t not clamped) is appended to TASK-217.

Checks: read-aloud-position 20/20 before these additions, the new ones 4/4. Final checkpoint numbers are in TASK-205.3 (full suite 292/292, @lowfps 4/4).

2026-10-27 lese-planner: accepted after verification (DONE). One input model (use-anchor-hold's reader-input signal; programmatic scrolls never open the window, checked for followWord, jumpTo fine align and anchor-hold aims); Space/ArrowDown e2e red before; underline restore after a swallowed settle; playing follow-back asserted. Full e2e 292/292, @lowfps 4/4. Desktop-only MEDIUM (selection drag / middle-click autoscroll window reset before the settle) filed as TASK-220 (m-14).
<!-- SECTION:NOTES:END -->
