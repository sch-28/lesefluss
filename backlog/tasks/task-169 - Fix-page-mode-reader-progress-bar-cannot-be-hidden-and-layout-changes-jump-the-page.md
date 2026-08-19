---
id: TASK-169
title: >-
  Fix page-mode reader: progress bar cannot be hidden and layout changes jump
  the page
status: Done
assignee: []
created_date: '2026-08-19 21:08'
updated_date: '2026-08-19 21:57'
labels:
  - bug
  - reader
  - capacitor
dependencies: []
modified_files:
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/page-view/index.tsx
  - apps/capacitor/src/pages/reader/page-view/chunk-content.tsx
  - apps/capacitor/e2e/page-objects/reader.ts
  - apps/capacitor/e2e/helpers/big-book.ts
  - apps/capacitor/e2e/page-mode-progress-bar.spec.ts
  - apps/capacitor/e2e/page-mode-orientation.spec.ts
  - apps/capacitor/e2e/page-mode-appearance-anchor.spec.ts
  - apps/capacitor/e2e/page-mode-turn.spec.ts
priority: high
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two bugs reported in the paginated ("page") reader mode of the Capacitor app, plus a third defect found during investigation that shares a root cause with the second.

**1. Progress bar cannot be hidden.** In page mode, once the progress bar appears it stays forever. In scroll mode the bar is hidden by scrolling; page mode has no scrolling, so no hide path exists. Tapping the centre of the page only ever shows it.

**2. Rotating the device jumps to a completely different page.** PageView stores the reading position as a raw page *number*. When the viewport changes, the page width and the measured chunk width change, so page N no longer holds the same content, but the stored page number is preserved and the view lands on unrelated text. Android does not recreate the Activity on rotate (`android:configChanges` includes `orientation|screenSize`), so React state survives the resize and the stale index is reused.

**3. (found during investigation, same root cause) Appearance changes also jump the page.** Changing font size, line spacing, or margin in page mode reflows the columns and produces the same stale-page-number jump. Line-spacing changes additionally leave the chunk width measurement stale, because the measurement effect does not observe line spacing.

Desired outcome: in page mode the progress bar toggles on centre tap and hides when the user turns a page, and the reader stays anchored to the word the user was reading across rotation and across appearance changes.

Relevant code: `apps/capacitor/src/pages/reader/index.tsx`, `apps/capacitor/src/pages/reader/page-view/index.tsx`, `apps/capacitor/src/pages/reader/page-view/chunk-content.tsx`. E2E suite: `apps/capacitor/e2e/` (Playwright, run with `pnpm e2e` from `apps/capacitor`); `e2e/page-mode-turn.spec.ts` is the closest existing example and `e2e/page-objects/reader.ts` is the shared reader page object.

Work test-first: the e2e coverage must be written and observed failing against the current code before the fixes are applied.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tapping the centre of the page in page mode shows the progress bar, and tapping the centre again hides it
- [x] #2 Turning a page in page mode hides the progress bar
- [x] #3 Scroll mode and RSVP mode progress-bar behaviour is unchanged
- [x] #4 Rotating the device (portrait to landscape and back) in page mode keeps the word the reader was on visible on screen
- [x] #5 Changing the reader font size in page mode keeps the word the reader was on visible on screen
- [x] #6 Changing the reader line spacing in page mode keeps the word the reader was on visible on screen
- [x] #7 A layout change in page mode does not write a new reading position to the database
- [x] #8 E2E tests cover each of the behaviours above and were observed failing against the pre-fix code
- [x] #9 Existing e2e suite, type checks, unit tests and biome checks all pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Test-first.

1. Extend `e2e/page-objects/reader.ts` with page-mode helpers: `pageModeVisibleWords` / `pageModeFirstVisibleWord` (geometry-based, since page mode keeps every word mounted and shifts with translateX), `expectWordVisibleInPage`, `tapPageCentre`, `progressBar`, and appearance-popover steppers.
2. Lift the big-book fixture out of `page-mode-turn.spec.ts` into `e2e/helpers/big-book.ts` alongside `openBigBookInPageMode` and `turnPages`.
3. Write `page-mode-progress-bar.spec.ts`, `page-mode-orientation.spec.ts`, `page-mode-appearance-anchor.spec.ts` and observe them failing.
4. Progress bar: add an `onHideProgressBar` prop to PageView, fire it from `goNext`/`goPrev`; make the reader's page-mode `onTap` a toggle rather than an unconditional show.
5. Anchoring: track the anchored word in a ref inside PageView and re-arm the existing `pendingTargetRef` re-anchor mechanism whenever a layout input changes, so the lander re-derives the page index from the word.
6. Add `lineSpacing` to ChunkContent's measure effect so a line-spacing reflow re-measures the chunk.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Progress bar: PageView had no hide path at all. `onHideProgressBar` was wired to ScrollView only, where scrolling triggers it; page mode has no scrolling. Added the prop and fire it from `goNext`/`goPrev` (not from `goToPage`, so a TOC/search `jumpTo` does not dismiss the bar). The reader's toggle reuses the existing `progressBarVisibleRef` mirror and delegates the show path to `handleScrollShowProgressBar`, keeping its progressWord flush and activity mark.

Anchoring: `pageIndex` is a raw page number, so any relayout invalidates it. The fix reuses the `pendingTargetRef` + lander mechanism that mount and `jumpTo` already use, re-arming it from a new `currentWordRef` whenever the layout key (viewport size, font size, font family, line spacing, margin) changes. Post-mount the lander only calls `setPageIndex` because its callbacks are gated on `isReadyRef`, so a re-anchor cannot move the saved position. This is covered by a dedicated test asserting the save count and saved word are unchanged across a rotation.

Two ordering hazards showed up while implementing the re-anchor. (1) The child's measure effect queues its state update before the parent's lander runs, so on the commit right after a relayout the lander would see a stale `currentChunkWidth` and clamp to the wrong page while consuming the pending target. Guarded by comparing `el.scrollWidth` to the measured width and deferring, but only after first mount so cold start can never stall behind the guard. (2) The transform-sync effect would paint the stale page for one commit before the lander corrected it, so it now skips while a re-anchor is pending.

The suite could not run at first: an unrelated project's dev server was occupying port 3001 and Playwright's `reuseExistingServer` attached to it, so every spec (including untouched ones) drove the wrong app. Ran against a spare port via a throwaway config while working. Nothing in the repo config was changed.

Each new test was observed failing against the pre-fix code, with the reader on word 792: rotation showed 542, a two-step font-size bump showed 547, and line spacing showed 632. The line-spacing case only bites at a phone-sized viewport and across several steps (1.8 to 2.3); a single 0.1 step on a desktop-width page keeps the same word on screen by luck, so both appearance tests run at 420x900. This was verified by temporarily reverting the two relevant source changes and re-running.

Post-implementation review: three fresh-context reviewers (conventions, correctness, security/data-integrity), none given the implementing conversation. Two independently found the same real defect in the fix, described below. All findings were verified against the code before acting; one was confirmed in mechanism but downgraded in severity after an empirical probe.

Defect in the original fix: the lander effect's dependencies were `[chunkIndex, currentChunkWidth, currentPageCount, isLayoutReady, pageWidth]`, none of which is the layout key that arms the re-anchor. Because `columnWidth === pageWidth` with `columnGap: 0`, a chunk's measured `scrollWidth` is quantised to whole columns, so a reflow that keeps the column count constant changes nothing the lander watches. The re-anchor then armed a target nothing consumed, which also left the transform-sync effect disabled via its new pending-target guard. Fixed by adding `layoutKey` to the lander deps, with a biome-ignore and a comment explaining that it is a deliberate re-run trigger the body does not read (the lint rule's unsafe autofix would otherwise silently remove it and reintroduce the bug).

Severity note on the above: a probe at 420px wide measured the actual drift. At constant column count (viewport height 900 to 840, scrollWidth 4940 throughout) the first visible word moved from 792 to 771, and `findPageForWord` would have selected that same page anyway, because `pageWidth` is unchanged so page N remains page N. The reviewer's claim that this shows unrelated text and persists a word the user never read did not hold: the wedge also self-heals on the next chunk crossing or width change, and `animateTo` writes the transform imperatively meanwhile. Real defect, bounded impact.

Three further correctness fixes from the review. (1) A layout change during a page-turn animation left the pending settle callback to fire with a pre-relayout `pageWidth` closure, reading the reflowed DOM with stale geometry and persisting an unrelated word; the re-anchor now drops the in-flight animation instead of letting it complete. (2) The re-anchor overwrote a cross-chunk `jumpTo` target that had not landed yet, silently reverting TOC and search jumps; an armed target now outranks the anchor. (3) The unmeasured-neighbour branch of `crossToNeighbor` never updated the anchor word, so a later re-anchor would land on a word the current chunk does not contain and clamp to its first or last page; it now anchors to the chunk edge it navigates into.

Test-harness fixes from the review. The appearance stepper helpers could silently no-op: `useSaveSettings` writes SQLite and only then invalidates, with no optimistic update, so a second click issued before the round-trip recomputed from a stale value. Both appearance specs could therefore pass vacuously. The helper now waits for the displayed value to change before dismissing the popover. Separately, the saved-position assertion point-read the save counter immediately, racing a write still in flight; it now gives a spurious save a 1.5s window to land and asserts none does.

Structural cleanups from the review: `settleAtPage` is parameterised by chunk index and is now the single owner of the anchor-word invariant (previously duplicated at two settle sites); `turnPages` moved from the EPUB fixture module onto the reader page object where the rest of the reader interaction vocabulary lives; `page-mode-turn.spec.ts` now uses the shared setup helper instead of keeping its own copy of it; an unchecked `as HTMLElement` cast replaced with an `instanceof` narrowing; `handleScrollHideProgressBar` renamed to `handleHideProgressBar` since it is now mode-agnostic, and `handleTogglePageProgressBar` to `handleToggleProgressBar`.

Not done, deliberately: a reviewer proposed grouping the reflow inputs into a single `layout` object passed to ChunkContent, replacing the hand-maintained `layoutKey` string and the `void fontSize;` dependency-trigger idiom. It is a fair observation that the reflow-input list is enumerated in two places that already disagree slightly, but the refactor touches the component's whole prop surface for no behavioural gain, so it was left out of a bug-fix change. Worth a follow-up if another reflowing appearance setting is added.

Regression coverage added: a height-only resize case in the orientation spec. It passes both before and after the layoutKey fix, so it is a guard rather than a reproduction. No test was found that fails solely due to the missing dependency, because at constant column count the correct and incorrect page indices coincide.

Re-verified after all review fixes: 59 e2e passed, 644 unit tests passed, tsc clean, biome clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixes three defects in the paginated reader, all e2e-covered test-first.

**Progress bar could not be hidden in page mode.** `onHideProgressBar` was only ever passed to `ScrollView`, where scrolling triggers it. Page mode has no scrolling, and its centre tap unconditionally showed the bar, so once visible it stayed forever. `PageView` now takes `onHideProgressBar` and fires it on `goNext`/`goPrev`, and the reader's page-mode `onTap` toggles instead of showing.

**Rotation and appearance changes jumped to unrelated text.** `PageView` stores the position as a raw page number, which means nothing once the column geometry changes: page 6 of a portrait layout holds different words than page 6 of a landscape one. The re-anchor mechanism already existed (`pendingTargetRef` plus the lander effect, used by mount and `jumpTo`) but was never re-armed on a layout change. It now re-arms from a tracked anchor word whenever viewport size, font size, font family, line spacing or margin changes. Two ordering hazards were handled: the lander defers while the measured chunk width lags the reflowed DOM, and the transform-sync effect no longer paints the stale page for a frame before the lander corrects it.

**Line-spacing changes left the chunk measurement stale.** Line spacing is applied as a CSS variable on an ancestor, so `ChunkContent`'s measure effect never saw it and reported a width from the previous layout. Added to its dependencies.

Files: `apps/capacitor/src/pages/reader/index.tsx`, `page-view/index.tsx`, `page-view/chunk-content.tsx`.

**Tests.** Three new specs (`page-mode-progress-bar`, `page-mode-orientation`, `page-mode-appearance-anchor`, 6 tests) plus page-mode helpers on the reader page object and a shared big-book fixture lifted out of `page-mode-turn.spec.ts`. Page mode keeps every word mounted and shifts with a transform, so the helpers determine the visible page geometrically rather than from DOM order. All six were observed failing against the pre-fix code, including a revert-and-rerun check for the line-spacing case. Full e2e suite 58 passed, 644 unit tests passed, tsc and biome clean.

**Risk / follow-up.** The re-anchor lands on the page containing the previously top-left word, so a reader mid-page can shift by a fraction of a page; that is the intended behaviour for a repagination and matches how the mount path already restores a position. Not verified on a physical device yet.
<!-- SECTION:FINAL_SUMMARY:END -->
