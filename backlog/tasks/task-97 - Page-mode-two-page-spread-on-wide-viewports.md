---
id: TASK-97
title: 'Page mode: two-page spread on wide viewports'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-26 03:15'
updated_date: '2026-10-28 21:53'
labels: []
milestone: m-13
dependencies: []
priority: high
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On tablet / desktop viewports above a breakpoint (~900px), render two pages side by side instead of one wide column. Standard e-reader behavior on landscape tablets and desktop web.

Implementation hint: the multicol container can use `column-count: 2` instead of single `column-width`. The translateX math becomes pageIndex * (2*pageWidth) per spread. Tap zones split into 4 (left page prev, left page center, right page center, right page next) or stay as 3 with current semantics.

Should be straightforward given the current explicit-pixel multicol setup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 At a reader container width >= 900px, page mode renders two pages side by side (a spread); below 900px it renders one page as before
- [x] #2 Landscape rotation / window resize across the breakpoint switches layout cleanly with no stray partial columns or blank flash left on screen
- [x] #3 A page turn (tap zone, swipe, arrow key, volume key) moves by one full spread; the saved position is the first word of the left page
- [x] #4 Three tap zones keep their semantics across the whole spread (left third prev, centre toggles chrome, right third next)
- [x] #5 Highlights, text selection, images/figures and read-aloud page follow keep working in spread mode
- [x] #6 Unit tests cover spread geometry (page-from-x, first visible word across both columns, page count); a Playwright e2e covers spread turns and a resize across the breakpoint keeping the word
- [x] #7 A layout switch across the breakpoint never saves a position: the anchored word stays on screen after the switch, a round trip back to the original layout shows the exact same first visible word, and no position write is requested
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Geometry: introduce pagesPerSpread (1|2), page gap, column-area width, and a page stride = area + gap. All translateX / page-index math (computeTransform, crossToNeighbor, measurements.ts page-from-x, pageCountOf) uses the stride; tap zones and swipe threshold use the visible area.
2. Breakpoint from the reader container's parent width (>= 900px) so the 700px single-page max-width does not hide it; spread raises max-width.
3. chunk-content: spread uses column-count: 2 + column-gap; single keeps column-width (unchanged). Chunk offsets use pageCount * stride so neighbour chunks start on a spread boundary.
4. Spread flag joins layoutKey so a breakpoint flip goes through the existing re-anchor path (pendingTarget = currentWordRef, no settle).
5. Tests: measurements unit tests for two-column geometry; e2e spec page-mode-spread (turns, resize across breakpoint keeps word, no save). Run page-mode-* and position-* specs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 owner decision: keep 3 tap zones with current semantics across the whole spread. Code refs at f8d79ba: pageWidth page-view/index.tsx:241, translateX :286/:538-540, tap zones :665-666, swipe threshold :787, page-from-x measurements.ts:40,:62, column styles chunk-content.tsx:175-179.

2026-10-28 implementation (worker session), revised after review round 1:
- Geometry lives in one pure helper, pageGeometry(available, margin) in page-view/chunks.ts (unit-tested): spread when the reader's width (the page view's parent, unrounded) >= SPREAD_MIN_WIDTH 900; view width = min(available, 700 single / 1400 spread); columnGap = 2*margin in a spread (each page keeps its margin on both sides), 0 single; columnStride = columnWidth + gap; pageStride = columnsPerPage * columnStride. Page index, page count and translateX all step by pageStride; single page: pageStride == column width as before.
- The view's width is derived from the parent width and set explicitly, so a breakpoint flip and a wide open lay the chunks out once (verified: one chunk width per open / crossing). Previously the view was measured after its new max-width applied, which laid out a cramped spread first.
- chunk-content.tsx: spread uses column-count: 2 + column-gap (count fixed; a width alone could round to one column); single page keeps column-width. Chunk width derived from the column props.
- Chunk offsets use pageCount * pageStride instead of raw scrollWidth, so the next chunk starts on a page boundary even when a spread's right page is empty. Correction to round 1: this is NOT identical in single mode. At a fractional width Chromium rounds scrollWidth up (e.g. 0.1px less room: 12.0008 pages), and the old ceil counted a phantom page, which with page-span offsets showed a blank page before the next chunk. pageCountOf now has 1px slack: ceil((w - 1) / stride). That also fixes the old invisible overcount. Covered by chunks.test.ts and an e2e in page-mode-chunk-crossing.spec.ts (fails on the old formula, passes now).
- measurements.ts readFirstVisibleWord(columns, pageStride, page, columnStride): the saved word is the topmost-leftmost word of the page's first column that holds words (left page wins even if the right starts higher; right page when the left is figure-only). findPageForWord unchanged (floor(x / pageStride)).
- Tap zones: 3 over the whole spread. Swipe threshold: 22% of one page. Justify decision uses the column width.
- Breakpoint flip: columnsPerPage is in layoutKey, so it takes the existing re-anchor (pendingTarget = currentWordRef; lander only setPageIndex; no settle). A layout change now also clears settleOnLandRef: a crossing still waiting to land would otherwise settle (and save) the first word of the reflowed page.
- Read-aloud read-from-view (spoken-word.ts firstVisibleWordInView): intersects with page mode's .page-clip, not the whole reader container; the previous page's columns in the side gutters (above 1400px, and 700-900px single) used to win in DOM order. Pre-existing, unit-tested.
- Browse threshold (review item 3): no code change. The long-move detector is speed-based: a step is browsing only when it moves more words than 1.5 x SANE_WPM_CEILING (1200 wpm) allows in the time between settles. A 400-word spread read at any real pace (>= 20 s) never counts. Five spreads flipped in seconds cover 2000 words, which is the same distance browse is defined by on a phone; scaling the threshold by columnsPerPage would let a tablet flick twice as far before browse. The planner's headless 8 quick turns enter browse for that reason. e2e: 8 spread turns at reading pace (fake clock, 30 s each) stay out of browse and each saves.
- e2e coverage: page-mode-turn, page-mode-progress-bar, highlights-modes, reader-images(-touch), read-aloud-position, position-external, reader-modes pinned to a 420x800 phone viewport. page-mode-orientation: landscape now 860 (single to single) plus a tablet 700x1100 to 1100x700 crossing case (word kept, no save, round trip exact). page-mode-spread.spec.ts (8 tests): spread shown + contiguous turn + save; 3 tap zones + touch swipe; contiguous turns across a chunk boundary and back; reading-pace turns stay out of browse; resize across the breakpoint (no save request, exact round trip, next turn saves forward); highlight on the right page; read-aloud follows onto the right page without a turn and turns after it; full-page figure stays on one page of a spread.

Open for the owner (assessment only, not built): blank right page at chunk ends. Each chunk is its own multicol container, about every 2000 words at a paragraph boundary; when its last spread fills only the left column the right page stays blank (about every 5-10 spreads at 1280px). Column-granular offsets (next chunk starts on the right column) would need: a column phase carried in state so spreads pair across two chunk elements; readFirstVisibleWord / findPageForWord / lander / crossToNeighbor working on a window-global column index spanning two chunk elements; the phase depends on the previous chunk's column count, which the deferred neighbour mount does not know at first paint (measure it first = the open cost the deferral removed, or accept a one-column shift once it measures). A jump or reopen re-pairs from phase 0, so the same text can pair differently depending on how it was reached. Effort M-L (2-3 days); risk high, all in position-critical code (lander, settle, re-anchor, read-aloud follow, browse). Cheaper options: accept (many e-readers start sections on a fresh page), or larger chunks in spread mode (fewer blanks, slower layout per chunk).

Round 2: removed the settleOnLandRef reset in the layoutKey effect (round 1). It dropped a real turn's save when a relayout hit between a crossing onto an unmeasured neighbour and its landing; the pending target stays the edge word, so saving that landing is correct, and the single layout pass removed the race it guarded. No deterministic e2e: crossing commit, chunk mount, measure and landing run in one task chain, so a resize cannot be placed between them without test-only timing hooks. AC2 checked after the planner's headless visual pass (899/1000/1800px, clean at 16ms after resize). Browse pushback (speed-based detector) accepted.
Owner decision pending: blank right page when a chunk ends on a left column (assessment in notes).

Owner decision (2026-10-28): accept the blank right page at chunk ends in two-page view (option a). No column-granular offsets.
<!-- SECTION:NOTES:END -->
