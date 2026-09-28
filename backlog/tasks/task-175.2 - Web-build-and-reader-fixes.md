---
id: TASK-175.2
title: Web build and reader fixes
status: Done
assignee:
  - '@claude'
created_date: '2026-09-28 16:18'
updated_date: '2026-09-28 18:00'
labels:
  - app
  - web
  - reader
dependencies:
  - TASK-172
  - TASK-171.15
parent_task_id: TASK-175
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Web-build and reader issues from the branch review.

- **W1.** In scroll mode the selection toolbar cannot be dismissed with Escape or by clicking the empty margin. TASK-172 removed the X button, Escape is handled only in RSVP (`use-keyboard-shortcuts.ts` ~88), and scroll mode dismisses only on a word tap (`reader/index.tsx` ~850).
- **W5.** The toolbar position uses `window.innerWidth`/`innerHeight` (`use-highlight-selection.ts` ~293), and nothing listens for resize or rotation, so an open toolbar stays in the wrong place.
- **W7.** Onboarding sign-in on the web build goes to `/login` without a redirect (`onboarding/steps/sync.tsx` ~18). The login page then defaults to the website's `/profile` instead of returning to `/app`.
- **T4.** The reader's buddy-marker popover (`buddy-read-markers.tsx`, `relativeTo`) shows "about N words ahead/behind" when positions are approximate. TASK-171.8 AC #16 says to hide the words figure then, as the buddy-read page does (`pages/social/buddy-read.tsx` ~124).
- **W6, optional:** `.reader-paragraph` has `user-select: none` but no `-webkit-touch-callout: none` (`monochrome.css` ~225), so a mobile browser may show its native callout on long press.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In scroll and page mode, Escape closes an open selection toolbar and clears the selection without leaving the reader
- [x] #2 Clicking or tapping empty reader space (margin, between paragraphs) closes the selection toolbar; tapping a word keeps its current behaviour
- [x] #3 The selection toolbar and handles reposition on window resize and orientation change while open
- [x] #4 Signing in from onboarding on the web build returns the user to /app (the onboarding next step or the library), not to the website /profile
- [x] #5 The reader's buddy-marker popover hides the words-ahead/behind figure when positions are approximate, matching the buddy-read page
- [ ] #6 Optional: -webkit-touch-callout: none on reader paragraphs, with no native callout on a mobile-browser long press
- [x] #7 Unit tests cover Escape and empty-space dismissal and the approximate popover; the onboarding redirect is covered by TASK-175.5's e2e spec
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan
- **W1, Escape** (`pages/reader/use-keyboard-shortcuts.ts`):
  - A pure exported `shouldDismissSelectionOnKey({ key, hasSelection, target, hasOverlay })`: true for Escape while a selection is open, unless focus is in a text field (input, textarea, contenteditable) or an Ionic overlay is open.
  - The keydown handler checks it first, before the interactive-target and mode branches. That way Escape on a focused toolbar button still dismisses, and an open selection never lets Escape exit RSVP.
  - The hook gets `hasSelection` and `cancelSelection` options.
- **W1, empty space in scroll mode** (`pages/reader/index.tsx`):
  - `ScrollView`'s container `click` listener (`onTap`) gets a new `handleScrollTap`: while a selection is open it cancels the selection and does not show the progress bar; otherwise it shows the bar as before. The selection state is read through a ref, because the listener is native.
  - **Why the drag-end click is safe:** it is already swallowed in the capture phase (`handleWordMouseDragStart`), as is the long-press click (`paragraph.tsx`), so neither reaches the container listener.
  - **Why toolbar clicks are safe:** the toolbar and handles render outside the scroll container.
  - A word tap while selecting still cancels, as before. It no longer also shows the progress bar.
  - Page mode already cancels on any tap (`page-view/index.tsx` ~672), so nothing changes there.
- **W5, repositioning** (`use-highlight-selection.ts`): while a selection is open, listen for `resize` and `orientationchange` on `window`, and for `resize` on `visualViewport` when it exists. The listeners are rAF-throttled into `syncHandlesRef.current()` and removed when the selection closes or on unmount.
- **W7, onboarding sign-in** (`pages/onboarding/steps/sync.tsx`): on the web build, go to `/login?redirect=${encodeURIComponent("/app/tabs/library")}`, the pattern `signed-out.tsx` uses; `finish()` already routes to `/tabs/library`. Native is unchanged.
- **T4, approximate positions** (`buddy-read-markers.tsx`): a pure exported `markerDetail(marker, myWord, approximate)` returns the popover's second line. When `approximate` is true it leaves out the words-ahead or words-behind figure, as `buddy-read.tsx` ~124 does, so the line shows only "reading now · N wpm" or nothing. The "about" wording goes away.
- **W6, optional:** add `-webkit-touch-callout: none` to `.reader-paragraph` next to `user-select: none`. The long-press selection runs on pointer events and a timer (`paragraph.tsx`), not on the native text selection, so the callout plays no part in it.
- **Tests:**
  - `use-keyboard-shortcuts` decision (Escape with a selection; not while typing in a field; not with an overlay open; other keys);
  - `markerDetail` (live and approximate, live and exact, not live and approximate);
  - toolbar positioning on a changed viewport (a narrower viewport clamps `left`, a shorter one flips the toolbar below);
  - a dev Playwright spec `selection-dismiss.spec.ts` in scroll mode: Escape dismisses, a click on the empty margin dismisses, and a mouse-drag selection stays open after its mouseup.
  - Run the existing highlight, selection and toolbar e2e specs.
- **Verify:** capacitor `pnpm check-types` (runs vitest), Biome, and Playwright on the selection and highlight specs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation (2026-09-28)
- **W1, Escape:** `use-keyboard-shortcuts.ts` exports `shouldDismissSelectionOnKey`: Escape with an open selection, unless focus is in an input, textarea or contenteditable, or an Ionic overlay is open. The handler checks it before the interactive-target, `isBlocked` and mode branches, so a focused toolbar button still dismisses and Escape never exits RSVP while a selection is open. The reader passes `hasSelection: sel.isSelecting && !sel.noteInputOpen` and `cancelSelection`. Page and RSVP go through the same check, since it runs before any mode branch.
- **W1, empty space in scroll mode:** `ScrollView`'s tap listener moved from the 700px text column to its full-width wrapper, so a click beside the column counts. The reader's new `handleScrollTap` cancels an open selection when the click is not on a `span[data-word]`, and otherwise shows the progress bar as before.
- **The regression found:** the Playwright run showed that dismissing on a word click broke word taps (`highlights-note` and `highlights-order` failed, with the dictionary opening). The container's native listener runs before React's word handler, and React re-renders in between, so the word handler saw no selection and looked the word up. Word clicks are therefore left to `handleWordTap`, which already cancels a selection.
- **Drag and long press:** the clicks that end them are swallowed in the capture phase (`handleWordMouseDragStart`, `paragraph.tsx`), so they never reach the listener.
- **Page mode:** already cancels a selection on any tap, so it is unchanged.
- **W5:** `use-highlight-selection.ts` adds rAF-throttled `resize` and `orientationchange` listeners on `window`, plus `resize` on `visualViewport`, while a selection is open. They are removed when it closes.
- **W7:** onboarding on the web build now goes to `/login?redirect=/app/tabs/library` (URL-encoded), the `signed-out.tsx` pattern. Native is unchanged.
- **T4:** `buddy-read-markers.tsx` exports `markerDetail`. When positions are approximate, the popover's second line leaves out the words-ahead or words-behind figure, as the buddy-read page does; the old "about N words" wording is gone. The line is not rendered when it would be empty.
- **W6:** `-webkit-touch-callout: none` on `.reader-paragraph`, next to the existing `user-select: none`. Selection is the app's own pointer and timer long press, so the callout plays no part in it.

## Verification
- Capacitor `pnpm check-types`: clean, vitest 681 of 681. New: `selection-dismiss.test.ts` (5) and a viewport case in `toolbar-position.test.ts`.
- Biome is clean on the touched files.
- Playwright (dev, root mode), full suite: 75 of 75, including the new `e2e/selection-dismiss.spec.ts`:
  - a mouse-drag selection keeps its toolbar after mouseup;
  - Escape dismisses;
  - a click in the empty margin dismisses.
- **Pending a browser or device check, left unchecked:**
  - #3: the resize and rotation listener. The positioning maths is unit-tested; the listener is not run in a browser.
  - #4: the onboarding redirect, to be covered by the TASK-175.5 e2e spec.
  - #6 (optional): the callout, on a mobile browser.
- AC #7: Escape and the approximate popover are unit-tested. Empty-space dismissal is covered by the dev Playwright spec rather than a unit test, because it depends on native event order.

## Verified in a browser (2026-09-28, TASK-175.5)
- **#3:** `e2e-app/selection-toolbar.spec.ts`, in the /app build.
  - It selects words at 1280 px, then resizes to 420 px. The toolbar must stay inside the new viewport and next to the moved selection.
  - **Mutation check:** disabling the resize re-measure (the `requestAnimationFrame(syncHandles)` in `use-highlight-selection.ts`) fails it.
  - The same spec covers Escape (a mutation disabling the Escape branch fails it) and the margin click in the /app build.
- **#4:** `e2e-app/sign-in-return.spec.ts`, "signing in from onboarding returns to the /app library, not the website profile".
  - The flow is fresh storage, onboarding up to "Sync across devices?", Sign in, the real /login, back on /app/tabs/library, then signed in inside the app. Onboarding is not offered again.
  - **Mutation check:** dropping the redirect parameter fails it.
  - This spec found TASK-175.6 (the jeep-sqlite store lost on unload). With that patch it passed 10 of 10 with `--repeat-each 10`.
- **#6** (optional; `-webkit-touch-callout` on a mobile-browser long press) stays open. It needs a real mobile browser and is left for the manual pass.

## Closed (2026-09-28)
ACs #1 to #5 and #7 are verified. Optional AC #6 (`-webkit-touch-callout: none` on a mobile-browser long press) is implemented but stays unverified: it needs a real mobile browser, so it is covered by the user's manual pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Web-build and reader fixes from the branch review:
- In scroll mode, Escape and a click in empty reader space dismiss the selection toolbar.
- The toolbar repositions on resize and rotation.
- Signing in from onboarding on the web returns to /app.
- The buddy-marker popover hides the word gap when positions are approximate.
- Optional: `-webkit-touch-callout: none` on paragraphs.

**Verification:**
- Unit tests.
- The dev Playwright suite (75 of 75).
- The /app e2e project (TASK-175.5) covers resize and the onboarding redirect; both specs were mutation-checked.

The optional callout AC stays with the manual pass.
<!-- SECTION:FINAL_SUMMARY:END -->
