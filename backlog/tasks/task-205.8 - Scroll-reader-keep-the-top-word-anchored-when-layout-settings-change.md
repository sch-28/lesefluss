---
id: TASK-205.8
title: 'Scroll reader: keep the top word anchored when layout settings change'
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
labels:
  - reader
  - bug
milestone: m-13
dependencies: []
modified_files:
  - apps/capacitor/src/pages/reader/use-anchor-hold.ts
  - apps/capacitor/src/pages/reader/scroll-view.tsx
  - apps/capacitor/src/pages/reader/paragraph.tsx
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/use-read-aloud.ts
  - apps/capacitor/src/pages/reader/view-types.ts
  - apps/capacitor/src/pages/reader/page-view/index.tsx
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/test-hooks/sync.ts
  - apps/capacitor/src/pages/reader/__tests__/use-anchor-hold.test.tsx
  - apps/capacitor/e2e/scroll-mode-appearance-anchor.spec.ts
  - apps/capacitor/e2e/page-objects/reader.ts
  - apps/capacitor/e2e/types.d.ts
parent_task_id: TASK-205
priority: high
ordinal: 172100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Existing bug, found in the 2026-10-26 review of TASK-205. It is a prerequisite for every layout-affecting setting in TASK-205.

In scroll mode, fontSize, fontFamily and lineSpacing are only applied as styles (apps/capacitor/src/pages/reader/scroll-view.tsx ~722,732). No effect re-finds the top word when they change. Here is what happens when the text reflows:
1. virtua corrects item heights and shifts the scroll offset.
2. handleScrollEnd (scroll-view.tsx ~663-690) saves whatever word is now at the top. The hasMoved guard (~687) only catches shifts under 4px.
3. The same correction also ticks handleScroll → onProgressChange, which is the userMovedRef path (see TASK-174).

So changing font size or line height today, either locally or through a sync while the reader is open, can save a drifted position.

Page mode has the equivalent mechanism: layoutKey (page-view/index.tsx ~320) plus the chunk measure-effect deps (chunk-content.tsx ~126-158). Scroll mode needs a matching layout key. On change it should capture the top word, then restore it with jumpTo(word, {highlight:false}), with the scroll-end and progress-change saves suppressed during the correction.

New settings in TASK-205.1/2/3 must plug into this key (scroll) and into both layoutKey and the chunk measure deps (page). A setting in only one of the two page-mode places freezes the lander. The guard at reader/index.tsx ~374 fails on every run and the transform sync stays blocked (~415).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Changing font size, font family, line height or margins in scroll mode mid-chapter keeps the line holding the reading word at the top and does not save a new reading position
- [x] #2 Same holds when the setting change arrives via sync while the reader is open
- [x] #3 Reopening the book after such a change restores the reading word's line at the top
- [x] #4 A single scroll-mode layout key exists that later settings (spacing, alignment, bold, font) can be added to; documented next to the page-mode layoutKey
- [x] #5 pnpm build succeeds; new Playwright e2e in apps/capacitor/e2e covers font-size and line-height change mid-chapter in scroll mode (position unchanged, reopen restores); existing position-*, page-mode-appearance-anchor, jump-settle-guard and appearance-persist specs pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Rework after review (2026-10-26):
1. Specs first: table-driven size/spacing/family/margins via real popover clicks on phone + wide viewports, rapid taps, sync via DEV hook running the sync service's real adopt step, narrower window, change before the open settles, scroll 200ms / 2s after a change, chapter-start heading case; leave via in-app back (unmount flush). Red verified.
2. useRelayoutAnchor hook (owns layout key effect, width ResizeObserver, re-anchor): anchor = parent's lastWordRef; one scrollToIndex(idx, {offset: word's offset in its paragraph}) after document.fonts.ready, which VList re-targets while re-measuring; no skeleton; saves held until the list is quiet (no scroll for 300ms), no fixed budget.
3. Cancel on wheel/touchmove, handle.jumpTo, handle.scrollBy; followWord waits while pending.
4. Initial/jump alignSpan: also correct a small negative delta, floor the scrollBy, so the line is never left above the edge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final (round 3 + final fixes, 2026-10-26). Supersedes earlier notes.

Root cause of the late drift (traced by lese-planner in real Chrome; corrects my earlier "re-renders once a second", which was wrong): when idle, ScrollView/VList render 0 times. The late 20-60px shifts are virtua's own scroll-jump compensation (_fixScrollJump on ACTION_ITEM_RESIZE) when never-measured paragraphs above the viewport mount for the first time. The buffer above comes and goes with scroll direction, and it happens without a React render. Sub-pixel scrollTop rounding on fractional item heights can then leave the line just above the edge. Headless Playwright doesn't show it.

Mechanism (src/pages/reader/use-relayout-anchor.ts, used by scroll-view.tsx):
- One layoutKey `fontSize|fontFamily|lineSpacing|margin` (useLayoutEffect), plus container width from a ResizeObserver (contentRect.width, 0 ignored). Wrap-affecting settings must also go into page-view layoutKey and the chunk measure deps.
- Anchor: parent's lastWordRef; while read-aloud runs detached, readAloud.viewWordRef (null leaves the view alone).
- settling: one synchronous scrollToIndex(idx, {offset: target's offset in its item, floor - 1}); VList re-targets it while re-measuring.
  - Target: the word's span. A heading paragraph renders no spans, so it carries `data-heading-word={start}` (paragraph.tsx) and the heading element is the target. An inline-title chapter start targets the item top. Unmounted: the paragraph start.
- Each quiet (300ms without scroll): on the top edge ([0,4)px) moves to holding. Otherwise re-aim with a relative scrollBy from the visible position (a repeated scrollToIndex can repeat VList's cache/DOM miss next to span-less items). If unmounted, aim again.
  - Budget is 5 aims per phase: it resets when holding starts, so late shifts after a costly settle are still corrected.
  - A missing target is never treated as the reader moving.
- holding: saves, progress ticks, highlight clear and bar hide stay off; late shifts are re-aimed.
  - Ends only on wheel, a touch drag past 10px, a scroll while the list element itself (scrollbar or margin) or the middle button is pressed, a scroll within 500ms of a navigation key, handle.jumpTo, handle.scrollBy (the reader's shortcuts and page turns), or a follow scroll once settled. A margin tap that scrolls nothing keeps it.
  - There is no far-move release: it saved the first body word after a heading anchor, overwrote word taps and saved at the end of the book. While the hold lasts, the unmount flush saves the anchor.
- handleScrollEnd consumes suppress flags before the pending check (a flag from the initial align no longer swallows the reader's first real scroll after a deferred re-anchor).
- start() cancels the view's in-flight jump fine-align or follow animation; cancel() resets the deferred start.
- alignSpan (open/jumps) shares isOnTopEdge/scrollOntoTopEdge, smooth path included.
- Known: wheel/touch hand-back can't stop VList's own re-target loop (up to 150ms); no public API.

Test hook: services/sync adoptServerSettings (used by pullSync), exposed DEV-only by test-hooks/sync.ts as window.__lesefluss_e2e_applyRemoteSettings (Partial<SyncSettings>).

Tests:
- e2e/scroll-mode-appearance-anchor.spec.ts (18):
  - size/spacing/family/margins × phone/wide via real clicks
  - rapid taps
  - sync hook (computed style asserted)
  - narrower window
  - change while a reopened book is still landing, then the next scroll saves (red without the suppress-order fix)
  - scroll 200ms and 2s after a change
  - next to a chapter break
  - long-paragraph mid-paragraph settle + A− (phone, wide)
  - planner's settings after a fresh reload
- Unit: __tests__/use-relayout-anchor.test.tsx (17): heading anchor, touch jitter vs drag, list press with and without a scroll, middle-button autoscroll, navigation keys, null anchor ending a hold, far move held and re-aimed, budget reset after a costly settle, and more.

Results (frozen tree):
- After the final fixes: capacitor tsc clean; biome: no diagnostics in touched files (repo-wide errors only in generated e2e-app/.auth and test-results JSON); vitest 1294/1294.
- e2e after the final fixes: scroll-mode spec repeat-each=3 54/54; position-* 18/18. Planner's full suite before them: 167/167.
- Real Chrome, final code (Morning Star, 1100 wide, serif/2.0/28/28): mid-paragraph saved 165488 stayed at count 1, line 1.1-1.2px from the top, through A−, A+ A+ A−, spacing, margins, 8s idle and a side-margin tap; the next wheel saved.

Follow-up: TASK-206 (reopen drift, pre-existing). Not on device (Android WebView).

Final fixes (2026-10-26): (1) touchmove hands back only past 10px of travel from touchstart Y, so a finger resting on a word to tap it keeps the hold. (2) Overlay-safe scrollbar/native input: the offsetX test is gone. A pointerdown on the list element itself, or a middle-button press, marks the pointer as held until a window pointerup/pointercancel. A Home/End/PageUp/PageDown/Space/arrow keydown opens a 500ms window. noteScroll cancels the hold when a scroll arrives during either; a margin tap that scrolls nothing keeps it. (3) followWord cancels the hold only on the branch that scrolls (jumpTo cancels itself). (4) start() with a null anchor calls cancel(), so an old hold stops re-aiming. (5) Page object: increaseFontSize doc moved back, unused offsetFromTopOf deleted. (6) Deferred-start comment deleted. Unit tests: touch jitter vs drag, a scroll during a list press (and a press+release that scrolls nothing), middle-button autoscroll, a navigation key vs another key, and a null anchor ending an old hold (17 tests in use-relayout-anchor.test.tsx).

2026-10-26 lese-planner: accepted after 4 review rounds (each with 3+ independent reviewers) and 4 real-Chrome passes on Morning Star (wide window, single/rapid A+/A-, spacing, margins, family, TOC-jump heading anchor, margin tap, idle). Final checks: full capacitor e2e 167/167, targeted repeat-each=3 81/81, scroll-mode spec repeat-each=3 54/54, position-* 18/18, vitest 1294/1294, tsc clean, vite build OK. Pre-existing issues found during this work moved to TASK-206 (reopen drift, TOC jump landing ~200px low and saving the previous chapter's last line). The hold will shrink to a re-aim with no save logic when TASK-206 lands.

2026-10-26: the hook was renamed in TASK-206.1: use-relayout-anchor.ts / useRelayoutAnchor -> use-anchor-hold.ts / useAnchorHold (its test file too). The notes above keep the old name as history.
<!-- SECTION:NOTES:END -->
