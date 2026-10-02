---
id: TASK-182
title: 'Reader: dim resting progress bar and hide it while content loads'
status: Done
assignee: []
created_date: '2026-10-02 10:46'
updated_date: '2026-10-02 11:04'
labels:
  - reader
dependencies: []
modified_files:
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/theme/monochrome.css
priority: low
ordinal: 127000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The collapsed 3px progress line uses the full-contrast fill colour and pulls focus from the text. While the reader shows the skeleton it still renders at full strength.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Collapsed progress bar is dimmed; expanded scrub bar unchanged
- [x] #2 Collapsed progress bar is not rendered while the reader skeleton is shown
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The collapsed progress line's track is dimmed to 40% opacity (the bar's opaque background stays solid so text under the safe area stays masked). The collapsed bar is not rendered while the reader skeleton shows; locked and error chapter overlays still show it. The expanded scrub bar is unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
