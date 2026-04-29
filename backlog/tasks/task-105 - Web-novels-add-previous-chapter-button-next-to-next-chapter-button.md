---
id: TASK-105
title: 'Web novels: add previous chapter button next to next chapter button'
status: Done
assignee: []
created_date: '2026-04-26 09:41'
updated_date: '2026-04-26 16:04'
labels: []
milestone: m-11
dependencies: []
references:
  - apps/capacitor/src/pages/reader/next-chapter-footer.tsx
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The footer shown at the end of a chapter (both scroll and page-turn modes) currently only has a "Next chapter" button. Add a "Previous chapter" button alongside it so users can navigate backwards without having to leave the reader.

The footer component lives in `apps/capacitor/src/pages/reader/next-chapter-footer.tsx`. Previous chapter navigation should mirror the existing next-chapter logic: look up the chapter at `chapterIndex - 1` for the current series, open it in the reader.

The previous button should be disabled / hidden when the user is already on the first chapter (index 0).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A 'Previous chapter' button is rendered next to the 'Next chapter' button in the chapter-end footer for serial chapters
- [x] #2 Tapping it navigates to chapterIndex - 1 for the current series, fetching if pending
- [x] #3 The button is hidden or disabled when the current chapter is the first (chapterIndex === 0)
- [x] #4 Both buttons appear in scroll mode and page-turn mode footers
- [x] #5 pnpm check-types passes
<!-- AC:END -->
