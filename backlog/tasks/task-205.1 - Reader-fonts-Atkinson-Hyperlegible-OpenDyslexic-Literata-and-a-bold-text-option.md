---
id: TASK-205.1
title: >-
  Reader fonts: Atkinson Hyperlegible, OpenDyslexic, Literata and a bold text
  option
status: To Do
assignee: []
created_date: '2026-10-20 22:22'
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
ordinal: 173000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reader offers only Sans (the inherited system font) and Serif (Georgia). It bundles no fonts, so how it looks depends on the device, and readers with dyslexia or low vision have no suitable choice. Kindle, Thorium and Readest all ship a dyslexia font.

Add these bundled, open-licensed fonts:
- Atkinson Hyperlegible, for low vision
- OpenDyslexic
- Literata, a proper reading serif

Also add a bold text toggle, as in Apple Books and Moon+. The fonts must work offline in the native app and on old WebViews (see TASK-191.6). Bundle size matters because of e-reader and low-end targets. The font enum is mapped in apps/capacitor/src/hooks/use-appearance-settings.ts (readerFontStack) and validated in packages/core/src/sync.ts.

Depends on:
- TASK-205.8 (scroll-mode re-anchor on layout change)
- TASK-205.9 (sync accepts new enum values)

Risks from the 2026-10-21 review:
- **Late font swap, high risk.** The font gate in page-view/chunk-content.tsx (~139) checks document.fonts.status BEFORE the first layout that uses the new family. A font nobody has requested yet still reports "loaded", so the first measure uses the fallback font. The later swap changes scrollWidth, but nothing re-measures: there is no loadingdone listener, and the chunk ResizeObserver never fires because the chunk has a fixed size. Result: a stale page count, skipped or blank pages, and the next page turn saves a drifted word. scroll-view.tsx (~163) has the same gap, only partly covered by the 600 ms stability poll. Toggling bold loads a new font file, so it hits this too.
- Font family and bold must go into the page-mode layoutKey (page-view/index.tsx ~320) AND the chunk measure-effect deps (chunk-content.tsx ~126-158), plus the scroll layout key from TASK-205.8. A setting in only one of the two page-mode places freezes the lander.
- The web build has no service worker, so offline web support isn't possible.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 User can pick Atkinson Hyperlegible, OpenDyslexic or Literata in the reader Appearance popover and Settings > Reader, and the reader text renders in that font
- [ ] #2 Fonts render with no network connection in the native app, and in the web build once loaded
- [ ] #3 Bold text toggle makes reader body text bold in scroll, page and RSVP modes, using a real bold face where one is shipped
- [ ] #4 Reader awaits document.fonts.load() for the selected family/weight before first measure, and page mode re-measures on document.fonts loadingdone; first open on a fresh install lands on the saved word
- [ ] #5 Font family and bold are part of the page-mode layoutKey, the chunk measure deps and the scroll layout key
- [ ] #6 Changing font or bold (locally or via sync while the reader is open) does not save a new reading position in scroll and page mode; reopening restores the same first visible word
- [ ] #7 Unknown font values map to Sans in readerFontStack and the Settings select
- [ ] #8 Font licenses are included in the repo; added bundle weight is noted in the task
- [ ] #9 Tests cover settings validation and sync of the new values
- [ ] #10 pnpm build and Android build succeed; new Playwright e2e covers font and bold change mid-chapter (position unchanged, reopen restores) in scroll and page mode; existing position-*, page-mode-*, appearance-persist and reader-images-progress e2e specs pass
<!-- AC:END -->
