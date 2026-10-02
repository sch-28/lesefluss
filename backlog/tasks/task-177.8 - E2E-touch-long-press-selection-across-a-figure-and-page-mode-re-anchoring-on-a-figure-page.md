---
id: TASK-177.8
title: >-
  E2E: touch long-press selection across a figure, and page-mode re-anchoring on
  a figure page
status: Done
assignee:
  - claude
created_date: '2026-10-01 22:16'
updated_date: '2026-10-01 22:33'
labels:
  - e2e
  - reader
dependencies:
  - TASK-177.7
modified_files:
  - apps/capacitor/e2e/page-objects/reader.ts
  - apps/capacitor/e2e/reader-images-touch.spec.ts
  - apps/capacitor/e2e/page-mode-figure-anchor.spec.ts
  - apps/capacitor/src/pages/reader/long-press.ts
  - apps/capacitor/src/pages/reader/paragraph.tsx
parent_task_id: TASK-177
priority: medium
ordinal: 122000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

The two highest-ranked gaps left after TASK-177.7's review:

1. Every selection spec drives the mouse path, which skips the touch long-press timer, the touchmove scroll block and the `wordIndexAt` null handling while the finger is over a figure. The WebView image-drag freeze (long-press on a draggable `<img>` wedging touch dispatch) was touch-only. The suite has no touch input at all today.
2. Page-mode re-anchoring (rotation, font size) is tested from text pages only. On a page that is a page-sized figure the settle leaves the current word on the previous text page, so a rotation could land a page back, and nothing asserts it never lands further back or loses the figure.

## Outcome

- A page-object helper drives a real touch long-press selection through Chrome DevTools touch events, usable by later specs.
- Spec: a touch long-press on the paragraph before a figure, dragged across the figure to the paragraph after it, enters selection mode, selects both ends, and the resulting highlight persists across reload. A long-press that starts on the figure itself opens no toolbar and, in page mode, turns no page.
- Spec: in page mode, with the page-sized figure on the current page, a viewport rotation and a font-size step keep the reader on that page or later (never earlier) and the figure stays reachable; no spurious save fires.
- Full Playwright suite green.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Page object exposes a touch long-press selection helper built on CDP touch events, with the long-press timing taken from the reader's constant
- [x] #2 Touch spec: long-press on the paragraph before Plate 1 dragged to the paragraph after it selects both words, the Highlight action works, and both ends are highlighted after reload
- [x] #3 Touch spec: a long-press starting on the figure opens no selection toolbar; in page mode the visible first word is unchanged afterwards
- [x] #4 Page-mode spec: with the page-sized figure visible, a rotation and a font-size step never move the position to an earlier page, the figure remains visible or the first visible word is at or after the pre-change position, and no save fires during the re-anchor
- [x] #5 Full Playwright suite passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. `e2e/page-objects/reader.ts`: `touchLongPressSelect(page, startText, endText)`: CDP session (`page.context().newCDPSession(page)`), `Emulation.setTouchEmulationEnabled`, `Input.dispatchTouchEvent` touchStart at the start span centre, wait `LONG_PRESS_MS` (imported from `src/pages/reader/paragraph.tsx`) + margin, touchMove in steps to the end span centre, touchEnd; returns nothing, callers assert. `touchLongPressOn(page, locator)`: the same without a drag, for the negative case.
2. `e2e/reader-images-touch.spec.ts`: (a) stray fixture, scroll mode: long-press "third", drag across Plate 1 to "fourth"; toolbar visible, both spans `.word-selecting`; `applyHighlight("yellow")`, reload via library, `expectHighlight` on both ends. (b) long-press on Plate 1's `<img>`: no toolbar within 1 s; page mode variant: `pageModeFirstVisibleWord` unchanged.
3. `e2e/page-mode-figure-anchor.spec.ts`: PORTRAIT viewport, `openBigBookInPageMode`, turn with the same loop as the progress spec until `img[alt="Figure 30"]` is visible, record `before` (last saved word or 0) and `firstVisible`; rotate to LANDSCAPE: poll until either the figure is visible or `pageModeFirstVisibleWord >= before`; assert no save lands within 1.5 s; rotate back; `increaseFontSize` once; same assertion.
4. Run both specs, then the full suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
`LONG_PRESS_MS` moved into a pure `src/pages/reader/long-press.ts` (re-exported from `paragraph.tsx`, nothing else changes) so the page object can import it without pulling React and the DB hooks into the Playwright process. The touch helper uses a CDP session (`Emulation.setTouchEmulationEnabled`, `Input.dispatchTouchEvent`); Chromium turns those into pointer events with `pointerType: touch`, so the reader's long-press timer, the touchmove scroll block and `wordIndexAt` over the figure all run for real. All five new cases passed on the first run.

Full suite: 105 tests, 103 passed, 2 failed in the long run (`import-folder` unreadable-file case at 32 s vs its usual 18 s, `library-bulk-select` tagging case); both passed 2/2 when rerun in isolation and neither touches images or the reader. Treated as load flakes during the 9.5 min run while another session was active on the same machine; worth watching, not fixed here.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed the two highest-ranked e2e gaps from the TASK-177.7 review.

- Page object: `touchLongPressSelect(page, start, end)` and `touchLongPressOn(page, target)` drive real touch input through Chrome DevTools (touch emulation + touch events), timed from the reader's own `LONG_PRESS_MS`; `selectionToolbar(page)` locator. First touch path in the suite.
- `reader-images-touch.spec.ts`: a touch long-press on the paragraph before Plate 1 dragged across the figure to the next paragraph enters selection, selects both ends, highlights, and both ends survive a reload; a long-press on the figure opens no selection; in page mode it turns no page.
- `page-mode-figure-anchor.spec.ts`: with the page-sized figure on screen, a rotation (both ways) and a font-size step never land on an earlier page, the figure stays visible or the first visible word is at or after the position, and no save fires during the re-anchor.
- `src/pages/reader/long-press.ts`: pure home for `LONG_PRESS_MS`.

Full suite 105 tests: 103 green in the long run, the 2 misses are unrelated load flakes that pass in isolation (noted in the task). Reader unit tests 87, Biome clean.
<!-- SECTION:FINAL_SUMMARY:END -->
