---
id: TASK-205.2
title: 'Reader spacing controls: letter, word and paragraph spacing'
status: To Do
assignee: []
created_date: '2026-10-20 22:23'
updated_date: '2026-10-20 22:34'
labels:
  - reader
  - accessibility
milestone: m-13
dependencies:
  - TASK-205.8
  - TASK-205.9
parent_task_id: TASK-205
priority: medium
ordinal: 174000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Kindle, Apple Books and Thorium let readers adjust character, word and paragraph spacing. These are the most commonly requested dyslexia and low-vision settings. Lesefluss has line height and horizontal margins only. Paragraph spacing is hard-coded at 1.1em in apps/capacitor/src/theme/monochrome.css (~219); check eink.css for overrides.

Add letter, word and paragraph spacing. Defaults must match today's rendering. Follow the line-height pattern: a settings column, a range in packages/core/src/settings.ts, sync, the Appearance popover, Settings > Reader and the reader preview.

Depends on:
- TASK-205.8 (scroll-mode re-anchor on layout change)
- TASK-205.9 (sync forward-compat)

Findings from the 2026-10-21 review:
- Word spans contain no spaces, because whitespace sits in separate text nodes or space spans (paragraph.tsx ~322-376). word-spacing on .word spans would do nothing, so apply spacing on the reader container, in em.
- The existing controls are +/- steppers (appearance-popover.tsx ~140-177), not sliders. Each change writes SQLite, bumps settings.updatedAt and re-lays out 3 chunks of 2000 words. That cost 200-600 ms on the Boox (TASK-191.4). Live per-pixel slider input would jank and spam sync.
- Each new value must go into the page-mode layoutKey (page-view/index.tsx ~320) AND the chunk measure deps (chunk-content.tsx ~126-158), plus the scroll layout key. Missing either page-mode place freezes the lander or silently shows different text, and the next page turn saves that text's word.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Letter, word and paragraph spacing controls exist in the reader Appearance popover and Settings > Reader with defaults that match the current rendering exactly
- [ ] #2 Controls are +/- steppers like line height (or commit on release); no re-pagination per drag tick
- [ ] #3 Spacing is applied on the reader container in em units, not on word spans; values are in the page-mode layoutKey, the chunk measure deps and the scroll layout key
- [ ] #4 Changing spacing (locally or via sync while the reader is open) does not save a new reading position in scroll and page mode; reopening restores the same first visible word
- [ ] #5 Word tap targets, highlights, active-word underline and selection still line up with the text at max spacing
- [ ] #6 An older client pushing settings without the new fields does not reset them on other devices
- [ ] #7 Tests cover ranges/validation and sync round-trip
- [ ] #8 pnpm build and Android build succeed; new Playwright e2e covers spacing change mid-chapter (position unchanged, reopen restores) in scroll and page mode; existing position-*, page-mode-*, appearance-persist and selection-dismiss e2e specs pass
<!-- AC:END -->
