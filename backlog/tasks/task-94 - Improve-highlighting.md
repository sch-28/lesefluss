---
id: TASK-94
title: Improve highlighting
status: Done
assignee: []
created_date: '2026-04-27 19:09'
updated_date: '2026-04-27 23:01'
labels: []
milestone: m-5
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- highlight toolbar should dissapear when switching pages, scrolling off or other actions. Atm it sometimes stays open
- sometimes highlighting triggers unintentionally
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed two highlight regressions in the page-mode reader.

**Toolbar persisting across page switches**
`page-view/index.tsx` — once a horizontal page-swipe is confirmed in `handlePointerMove`, call `onCancelSelection()` alongside the existing `cancelAnyActiveLongPress()`. Selection is dropped the moment the user commits to a page turn instead of staying pinned to the leaving page's word offsets.

**Long-press release in page mode cancelled the selection it just created**
`page-view/index.tsx` — `handlePointerUp` classified any release with no movement as a tap, and the existing "tap-elsewhere dismisses selection" branch then nuked the selection that the 400 ms long-press had just entered. Now `handlePointerUp` records the pointer-down timestamp; if the hold exceeded `LONG_PRESS_MS` (exported from `paragraph.tsx` to keep the threshold single-sourced), it's treated as a long-press end, not a tap. Scroll mode was unaffected because it doesn't run this tap-vs-swipe classifier.

**Back-swipe accidentally creating a highlight + flashing in library**
Two compounding causes:
- `paragraph.tsx` — the long-press pointer listeners only registered `pointermove` + `pointerup`. Ionic's swipe-back gesture controller captures the pointer mid-gesture, which fires `pointercancel` on the original target — without a listener for it, the 400 ms long-press timer fired unimpeded and entered selection mode. Added `pointercancel` to both registration and cleanup.
- `reader/index.tsx` — the selection toolbar/handles render via a `document.body` portal, so any active selection stayed pinned in screen space while the IonPage slid out, briefly flashing over the library. Added `useIonViewWillLeave` to call `sel.cancelSelection()` at the start of the leave transition.
<!-- SECTION:FINAL_SUMMARY:END -->
