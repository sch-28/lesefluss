---
id: TASK-180
title: 'Reader TOC: scroll to and highlight current chapter on open'
status: Done
assignee: []
created_date: '2026-10-02 10:10'
updated_date: '2026-10-02 10:28'
labels:
  - reader
  - ux
dependencies: []
modified_files:
  - apps/capacitor/src/pages/reader/contents-list.tsx
  - apps/capacitor/src/pages/reader/__tests__/contents-list.test.tsx
  - apps/capacitor/src/pages/reader/annotations-sheet.tsx
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/library/series-chapter-list.tsx
  - apps/capacitor/src/pages/library/__tests__/series-chapter-list.test.tsx
  - apps/capacitor/src/pages/library/sort-filter.test.ts
  - apps/capacitor/src/test/book-fixture.ts
  - agents/capacitor.md
priority: medium
ordinal: 124000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opening the annotations sheet (Contents tab for EPUBs, Chapters tab for serials) always shows the list from the top, so the reader has to scroll to find where they are. The sheet should open with the current chapter visible and visually marked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Contents tab opens scrolled so the current chapter row is visible near the top of the half-height sheet
- [x] #2 Current chapter row in Contents is visually marked and has aria-current
- [x] #3 Serial Chapters tab scrolls to and marks the chapter currently open in the reader
- [x] #4 SeriesChapterList on SeriesDetail behaves unchanged when no current book is passed
- [x] #5 Tests cover the Contents scroll/marking
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Contents list extracted to contents-list.tsx; scrolls parent (positioned) container to current row offsetTop minus one row, since the sheet opens at the 0.5 snap point. SeriesChapterList gets optional currentBookId: marks row and scrollToIndex(index-1, start) once per mount so background refreshes don't re-scroll. Not yet verified on device/WebView (happy-dom has no layout; test stubs offsetTop).

Review fixes: annotations-sheet scroller keyed by tab (scrollTop no longer leaks into Highlights/Glossary); ContentsList scrolls once per mount to the previous row's real offsetTop; ChapterRow isCurrent -> isInProgress; makeBook moved to src/test/book-fixture.ts; SeriesChapterList tests added.

End-of-book fix: vaul offsets snap points by innerHeight*(1-snap) while DrawerContent is capped at 85vh, so the 0.9 full snap hid the sheet's bottom ~10vh. Full snap now 1; ContentsList gets obscuredHeight (hidden px at the 0.5 snap) and calls onNeedsFullHeight when the clamped row would land there. Snap reset moved from passive effect to render so the child's expand request wins. Verified on device by user.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reader TOC now opens on the current chapter.

- Contents tab (EPUB): new `ContentsList` marks the current chapter (`aria-current`, tint) and scrolls it near the top once per open, with the previous row as context. When the chapter is near the end and the scroll clamps into the part hidden at the half snap point, the sheet opens at full height.
- Chapters tab (serials): `SeriesChapterList` takes optional `currentBookId`, marks that row and `scrollToIndex`es once per mount; SeriesDetail unchanged.
- Annotations sheet: scroller keyed by tab (no scroll leak between tabs); full snap point 0.9 -> 1 because vaul's offset math hid the bottom ~10vh of the 85vh-capped drawer (also cut off the last highlights/glossary rows); open-reset moved from effect to render.
- Tests: contents-list (8 cases incl. clamp/expand), series-chapter-list (3); `makeBook` moved to `src/test/book-fixture.ts`.

Known, out of scope: legacy TXT imports (old system) store chapter offsets in non-word units; user confirmed fine.
<!-- SECTION:FINAL_SUMMARY:END -->
