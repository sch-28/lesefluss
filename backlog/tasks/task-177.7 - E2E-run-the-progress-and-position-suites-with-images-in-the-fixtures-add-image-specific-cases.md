---
id: TASK-177.7
title: >-
  E2E: run the progress and position suites with images in the fixtures, add
  image-specific cases
status: Done
assignee:
  - claude
created_date: '2026-10-01 19:25'
updated_date: '2026-10-01 20:32'
labels:
  - e2e
  - reader
dependencies:
  - TASK-177.6
modified_files:
  - packages/book-import/src/test-fixtures/build-epub.ts
  - packages/book-import/src/__tests__/images.test.ts
  - apps/capacitor/e2e/helpers/big-book.ts
  - apps/capacitor/e2e/import-epub.spec.ts
  - apps/capacitor/e2e/reader-images-progress.spec.ts
parent_task_id: TASK-177
priority: high
ordinal: 121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

Position saving, restore, flush-on-exit, TOC jumps, page turns, highlights and sessions are covered by ~25 Playwright specs, but every one of them runs on a fixture without images. Figures are now block elements in both reading modes; they change what sits at the viewport top, which paragraph a chapter jump lands on, how pages paginate, and what a figure-only page saves. The guarantee that progress still works has to come from the e2e suite, not from reasoning.

## Outcome

- The two shared fixtures (`strayAnchorFixture`, used by the reader seed, and `bigBookFixture`, used by page-mode specs) carry real, decodable images at every placement the importer supports: an image-only page before the first chapter, chapter art in a heading, an image between paragraphs, an image inside a paragraph, and a trailing image. Text output stays byte-identical, so every existing assertion on content and word positions keeps its meaning; the specs simply run with figures in the DOM.
- New image-specific cases cover what figures change: the settle save when a figure is at the viewport top (saved word is the first word after it, never a rewind), restore landing with a figure above the saved word, a TOC jump to a chapter whose first paragraph has a figure above it, page mode with a figure-only page (page count stable after images load, turning across it, saved word never decreasing), and a highlight spanning a figure.
- The whole e2e suite passes with the new fixtures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 strayAnchorFixture and bigBookFixture include decodable images at all five placements and their text output is unchanged (unit assertion in the package tests)
- [x] #2 All existing e2e specs pass unchanged against the image-bearing fixtures
- [x] #3 New spec: scrolling a figure to the viewport top saves the first word after it and reopening lands on that word with the figure above it
- [x] #4 New spec: a TOC jump to a chapter with a figure above its first paragraph lands with heading and figure visible and saves the chapter start, surviving the settle guard
- [x] #5 New spec: page mode with a figure-only page keeps its page count after images load, turns across the figure page, and the saved word never decreases
- [x] #6 New spec: a highlight spanning a figure persists across reload
- [x] #7 The full Playwright suite is green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. `packages/book-import/src/test-fixtures/build-epub.ts`: two small real PNGs (solid colour, generated once, embedded as base64: a 200x120 landscape and a 120x300 portrait) and a `FIXTURE_IMAGES` set. `strayAnchorFixture()` gains: an image-only `map.htm` spine item before chapter 1, chapter art in the existing `<h1 class="chapter2"><img>` (now a real file), an image block between paragraphs 3 and 4 of each chapter, an image inside paragraph 5, and a trailing image after chapter 2's last paragraph. Text output unchanged (all images are text-less blocks or inside existing `<p>`s).
2. `apps/capacitor/e2e/helpers/big-book.ts`: `bigBookFixture()` gets a figure every 15 paragraphs and one tall portrait image that fills a page on its own.
3. Package test: parsing the stray-anchor fixture with and without its images yields identical `content`, chapters and link ranges.
4. New `apps/capacitor/e2e/reader-images-progress.spec.ts`: (a) scroll mode: scroll the mid-chapter figure to the viewport top, wait for the settle save, assert the saved word is the first word of the paragraph after the figure, round-trip through the library and assert that paragraph is in viewport with the figure above it; (b) TOC jump to chapter 2 (figure above its first paragraph after the map/trailing placement): heading and figure in viewport, saved word equals the chapter start and survives the settle guard; (c) page mode on the big book: record page count after images settle, turn pages across the figure-only page asserting `lastSavedWord` never decreases and the page count stays; (d) highlight from the paragraph before a figure to the paragraph after it persists across reload.
5. Run the full Playwright suite; fix any spec whose assumptions the figures break (expected: none on text, possibly viewport-top assumptions).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixture sizing matters: the first version gave the seed fixture a tall portrait map page, which filled the viewport at open; the virtual list then mounted no word spans and ~30 specs (plus explore-worker's catalog specs, which reuse the same fixture) failed on their "first word visible" assumption. Seed figures are now 1200x100 (about 55 px tall at the e2e column width) so chapter 1 still fits the viewport; only the big-book fixture carries the 800x2000 portrait that owns a page in page mode. `import-epub.spec` deliberately uses `withoutImages(strayAnchorFixture())`: it asserts all chapter text is mounted at open, which virtualisation only allows for a short book.

Finding while writing the figure-at-top case: scrolling a figure to the viewport top produces no new DB write. Expected: the scroll tick already records the paragraph after the figure as the position and the settle finds the same word, so the write is skipped as redundant; leaving the reader flushes it and reopening lands on that word. The spec asserts the viewport-top word and the restored position rather than a save event.

Page mode: a figure-only page saves nothing (`readFirstVisibleWord` returns null) and the saved word never decreases across it; the spec turns pages without waiting for per-turn saves for that reason.

Full Playwright suite: 96 passed in 8.7 min, including the previously fixed highlight-delete spec and explore-worker's catalog/explore specs.

Review round 5 (three fresh reviewers: conventions, correctness/strength, coverage gaps). Fixed: leftover base64 literals from fixture iteration removed; the figure-at-top case no longer compares DOM against DOM but asserts the flushed save after an in-app back navigation (`lastSavedWord === expected`, client-side navigation keeps the hook alive) and that reopening aligns that exact word at the top (`reader.scrollModeTopWord`); the TOC-jump case bounds the saved word from below with chapter 1's last word (inclusive: a chapter start floors onto the previous paragraph's last word because `#` is not a word); the page-mode case no longer depends on a sub-pixel "figure-only page" (0.6 em of slack) and instead requires the page-sized figure to have been visible during the turns, drops the tautological page-count equality, and tolerates a turn without a save; `withoutImages` strips `<img>`, `<img/>` and SVG `<image>`; the invariance test asserts non-empty text. Page object gained `wordPositionIn`, `firstWordPositionIn`, `scrollModeTopWord`, `pageModePageCount`, `blurFocusedControl`, `OPEN_SETTLE_MS`, `waitPastJumpGuard`; `seedFixture` in `helpers/seed.ts` replaces three copies of reset/build/import.

Coverage gaps closed from the review: search jump to the paragraph after a page-sized figure (scroll mode: saved word and viewport-top word equal the target, survives the jump guard; page mode: target visible and saved), a trailing page-sized figure under the end-of-book rules (`bigBookFixture({ trailingFigure })`; the virtual list measures the figure only once mounted, so the end moves after the first wheel, hence `wheelToEnd`; the scroller lookup starts from any reader block because only the figure is mounted at the very end), and a book that opens on a page-sized figure (`leadingFigure`: figure in viewport, no save until the reader moves, same on reopen).

Gaps left open, ranked: touch long-press selection started beside and dragged across a figure (needs a CDP touch helper in the page object; the suite has no touch path at all today); page-mode re-anchor (rotation, font size) while the current page is a figure page; sepia/dark figure styling (no spec switches theme; fixtures are solid PNGs so the line-art branch never renders); missing image rows on the web build (needs a dev hook to delete rows). Buddy/discussion markers are percent-based and DOM-independent; RSVP and flush-on-exit are covered incidentally by the image-bearing fixture.

Full Playwright suite after the round: 100 passed in 8.9 min; parser package 88.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The progress, position, highlight, session and page-mode e2e suites now run with figures in the reader, and four image-specific cases cover what figures change.

- `strayAnchorFixture` (reader seed, ~26 specs) carries real PNGs at every placement: an image-only page before chapter 1, chapter art in a heading, a plate between paragraphs, an ornament inside a paragraph, a trailing plate. `withoutImages()` strips them; a package test proves text, chapters and links are identical with and without. Figures are short (1200x100) so the first chapter still fits the viewport at open.
- `bigBookFixture` (page-mode specs) has a figure every 15 paragraphs and one 800x2000 portrait that owns a page.
- New `reader-images-progress.spec.ts`: figure scrolled to the viewport top → position is the paragraph after it and restores there; TOC jump with chapter art visible keeps the chapter start through the settle guard; page mode keeps its page count, turns across a figure-only page and never rewinds; a highlight spanning a figure persists across reload.
- `import-epub.spec` uses the image-free variant (it asserts all text mounted at open).

Full suite green: 96 tests. No app code changed.
<!-- SECTION:FINAL_SUMMARY:END -->
