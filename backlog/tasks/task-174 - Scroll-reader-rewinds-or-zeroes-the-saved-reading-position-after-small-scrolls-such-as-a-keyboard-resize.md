---
id: TASK-174
title: >-
  Scroll reader rewinds or zeroes the saved reading position after small scrolls
  such as a keyboard resize
status: Done
assignee: []
created_date: '2026-09-27 13:03'
updated_date: '2026-09-27 15:10'
labels:
  - capacitor
  - reader
  - bug
  - sync
dependencies: []
references:
  - apps/capacitor/src/pages/reader/scroll-view.tsx
  - apps/capacitor/src/pages/reader/index.tsx
  - >-
    backlog/tasks/task-172 -
    Reader-selection-toolbar-redesign-two-step-labelled-toolbar-for-creating-and-editing-highlights.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during the TASK-172 device test (Pixel 8 Pro, 2026-09-27). In scroll mode the saved reading position can jump backwards, or all the way to 0, without the user moving on purpose. On the phone test DB, "A Tale of Two Cities" went from 92% to 0%, and in a controlled repro from 90% to 62%. The server received the bad value through the normal sync push, which overwrote the good position (sync_books.word_position = 0).

Two mechanisms, both in the existing reader code (not caused by TASK-172):
1. `scroll-view.tsx` `handleScroll` reports progress per paragraph (`paragraphStartWords[findItemIndex]`). `index.tsx` `handleSetProgressWord` copies that into `lastWordRef` and sets `userMovedRef` on every scroll tick. If no scroll-end settle follows (for example a viewport resize when the soft keyboard opens for a note), the unmount flush saves the paragraph-start word. That rewinds to the start of the paragraph, or to 0 for a single-paragraph book.
2. `handleScrollEnd` saves the word at the top of the viewport. Near the end of a book the restored word can't reach the top, so the first scroll end after opening (including one caused by the keyboard resize) saves an earlier word.

Repro: in scroll mode, open a book near its end (or a single-paragraph TXT), long-press a word, tap Note so the keyboard opens, tap Done, go back to the library. The percentage drops.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening and closing the soft keyboard (note sheet, search, glossary editor) in scroll mode does not change the saved reading position
- [x] #2 Leaving the reader straight after a scroll never saves a coarser position than the last settled word (no paragraph-start rewind, no 0 for single-paragraph books)
- [x] #3 Opening a book whose saved word cannot be scrolled to the viewport top (near the end) and scrolling nothing keeps the saved position unchanged
- [x] #4 Unit or integration tests cover the resize-without-settle case and the unmount-flush value
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Agreed with the user: tread lightly (fragile area), failing e2e first, scroll mode only; AC "word-level live progress bar" dropped (display only, would add per-tick DOM work in the hot scroll path).
1. e2e/position-end-of-book.spec.ts reproduces both mechanisms and fails on the old code.
2. scroll-view reports `isAtEnd` (virtua scrollOffset + viewportSize >= scrollSize - 1) with ticks and settles, and `hasMoved` (offset moved >= MIN_SETTLE_SCROLL_PX = 4 since the last scroll end) with settles.
3. index.tsx: a tick never replaces a finer lastWordRef in the same paragraph (or a later one at the very bottom); a settle that didn't really move, or at the bottom with a later settled word, restores `settledWordRef` (seed/settle/save/BLE) instead of saving the top word.
4. Verify: full e2e, vitest, device repro, 5-agent review plus a verifier.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Failing e2e first: apps/capacitor/e2e/position-end-of-book.spec.ts fails deterministically before the fix. (1) End of book: saved word 782, reopen, a 1px up-and-back scroll with the view unchanged (stands in for Android clamping the scroller when the keyboard closes; desktop viewport resizes don't clamp) rewinds the save to 641, the top word. (2) Single paragraph: settled at 1140, a small wheel scroll, leave within two frames: the flush saves 2 (paragraph start). Scrolls wait INITIAL_SETTLE_MS=1500 because scroll-ends in the post-open cooldown are ignored by design. Playwright ran on port 5197 through a temporary config, because 3001 is taken locally.

Device (Pixel 8 Pro): first fix (bottom check at settle time) still rewound 100% -> 62%. Instrumented through WebView devtools: saving the highlight shrinks the content by 1px, clamping scrollTop about 1px at the bottom; the keyboard opens about 30ms later (viewport 1065 -> 696), so virtua's 150ms-delayed scroll end saw the view as not at the end. Added the hasMoved rule (< 4px since the last scroll end = layout clamp) plus an e2e test for that exact sequence (it failed first, then passed).

5-agent review (regressions, other position paths, test quality, conventions, data integrity) plus a verifier. Kept findings: (R1, found by 3 reviewers) the no-move branch trusted lastWordRef, which ticks overwrite with a paragraph start mid-gesture; fixed with settledWordRef, restored on no-move and at-end settles. Comment bloat in both handlers trimmed. Tests: added a keyboard-closing clamp at the end (the only test that fails without the at-end rule), a drag-up-and-flick-back-to-end test (R1), and backward scrolls still saving; every test now waits for the leave flush to commit and reopens the book to check the DB position. Mutation checks: reverting R1 fails 4 tests; removing the at-end rule fails the keyboard-closing test. Dropped as refuted or nits: offset accumulation (virtua re-arms scroll end during touch), an out-of-range seed (no unclamped source), positional booleans, T3/T4/T5 timing (tests fail on the old code), DRY and naming nits in tests.

Verified: 6 new e2e tests pass on repeat; full suite 71/72 (1 known flaky import-setup timeout, passes on re-run); vitest 671; biome clean; device: note flow at the end keeps 100%, drag-up-and-flick-back keeps 100%, normal scrolls still save (20%, and 0% at the top). Known trade-off: a move inside one long paragraph that is left before its scroll settles keeps the previous settled word instead of rewinding to the paragraph start.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixes the scroll reader rewinding (or zeroing) the saved reading position without the user moving: near the end of a book after the soft keyboard or a highlight nudged the scroller, and in long paragraphs when the reader was left mid-scroll.

Changes (apps/capacitor/src/pages/reader):
- scroll-view.tsx: scroll ticks and settles report `isAtEnd` (scrolled to the very bottom); settles also report `hasMoved` (false when the view moved < 4px since the last scroll end: a layout clamp).
- index.tsx: a new `settledWordRef` holds the word the reader last came to rest on (seed, settle, save, BLE seek). A settle that didn't really move, or one at the bottom with a later settled word (still on screen there), restores it instead of saving the viewport-top word. A tick (paragraph-granular) no longer replaces a finer word in the same paragraph, nor a later one at the bottom.
- Page mode, RSVP, jumps, restore/durable fallback and sync paths are unchanged (page view passes one argument; defaults keep old behaviour).

Tests: e2e/position-end-of-book.spec.ts (6 tests: a no-move scroll at the end, a 1px clamp followed by the keyboard opening, the keyboard closing at the end, drag up and flick back, leaving mid-scroll in a long paragraph, backward scrolls still saving), each checking the DB position by reopening. The first two failed on the old code; mutation checks confirm the new guards are covered. The e2e page object was updated for the TASK-172 toolbar. Full suite 71/72 (known flaky import step), vitest 671, biome clean, device-verified on a Pixel 8 Pro. Reviewed by 5 agents plus a verifier; all confirmed findings fixed.

Dropped with the user: word-level live progress bar inside long paragraphs (display only).
<!-- SECTION:FINAL_SUMMARY:END -->
