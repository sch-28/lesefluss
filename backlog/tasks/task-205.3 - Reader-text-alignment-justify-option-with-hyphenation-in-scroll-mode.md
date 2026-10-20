---
id: TASK-205.3
title: 'Reader text alignment: justify option with hyphenation in scroll mode'
status: To Do
assignee: []
created_date: '2026-10-20 22:23'
updated_date: '2026-10-20 22:35'
labels:
  - reader
milestone: m-13
dependencies:
  - TASK-205.8
  - TASK-205.9
parent_task_id: TASK-205
priority: low
ordinal: 175000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Kindle, Apple Books and Moon+ offer left-aligned or justified text. Lesefluss is always left-aligned.

Hyphenation (`hyphens: auto` plus the book `lang`) currently applies only in page mode (apps/capacitor/src/pages/reader/page-view/chunk-content.tsx). Scroll mode has none, so justified text would leave big gaps there. Add an alignment setting (left or justify), and bring hyphenation and `lang` to the scroll list so justify looks good in both modes.

Depends on:
- TASK-205.8 (scroll-mode re-anchor on layout change)
- TASK-205.9 (sync forward-compat)

Findings from the 2026-10-21 review:
- Hyphenation in scroll mode is cheap: VList lays out only the mounted paragraphs.
- Words hyphenated across lines return two client rects. Page-mode measurements already use the first rect (measurements.ts ~257,264). But the selection handles use getBoundingClientRect (use-highlight-selection.ts ~261,274,290), which spans both lines, so they get misplaced. This bug already exists in page mode. spoken-word.ts (~25) has the same issue.
- The scroll save uses the bbox top (scroll-view.tsx ~676), so a split word at the top is skipped. That's stable on restore.
- Justified gaps between spans aren't tap targets, so drag selection can briefly find no word (word-at-point.ts). Highlights still cover the gaps.
- Decision: unknown book language keeps the existing deliberate "en" fallback in hyphenation-lang.ts (~312-322), matching page mode today.
- The alignment value must go into the page-mode layoutKey, the chunk measure deps and the scroll layout key.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Alignment setting (left / justify) in the Appearance popover and Settings > Reader; default left
- [ ] #2 Justify applies in scroll and page mode; value is in the page-mode layoutKey, chunk measure deps and scroll layout key
- [ ] #3 Scroll mode sets lang on the list and hyphenates the same way as page mode (including the existing 'en' fallback for unknown languages)
- [ ] #4 Selection handles and the spoken-word mark use the first/last client rect of the start/end word, correct for hyphen-split words in both modes
- [ ] #5 Toggling alignment (locally or via sync while the reader is open) does not save a new reading position in scroll and page mode; reopening restores the same first visible word
- [ ] #6 Setting syncs between devices; older clients omitting it do not reset it
- [ ] #7 Tests cover the setting and sync
- [ ] #8 pnpm build and Android build succeed; new Playwright e2e covers alignment toggle mid-chapter (position unchanged, reopen restores) in scroll and page mode and selection across a hyphen-split word; existing position-*, page-mode-*, highlights-* and selection-dismiss e2e specs pass
<!-- AC:END -->
