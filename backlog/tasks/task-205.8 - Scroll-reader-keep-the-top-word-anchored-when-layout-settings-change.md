---
id: TASK-205.8
title: 'Scroll reader: keep the top word anchored when layout settings change'
status: To Do
assignee: []
created_date: '2026-10-20 22:34'
updated_date: '2026-10-20 22:35'
labels:
  - reader
  - bug
milestone: m-13
dependencies: []
parent_task_id: TASK-205
priority: high
ordinal: 172100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Existing bug, found in the 2026-10-21 review of TASK-205. It is a prerequisite for every layout-affecting setting in TASK-205.

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
- [ ] #1 Changing font size, font family or line height in scroll mode mid-chapter keeps the same first visible word and does not save a new reading position
- [ ] #2 Same holds when the setting change arrives via sync while the reader is open
- [ ] #3 Reopening the book after such a change restores the same first visible word
- [ ] #4 A single scroll-mode layout key exists that later settings (spacing, alignment, bold, font) can be added to; documented next to the page-mode layoutKey
- [ ] #5 pnpm build succeeds; new Playwright e2e in apps/capacitor/e2e covers font-size and line-height change mid-chapter in scroll mode (position unchanged, reopen restores); existing position-*, page-mode-appearance-anchor, jump-settle-guard and appearance-persist specs pass
<!-- AC:END -->
