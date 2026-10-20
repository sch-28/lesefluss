---
id: TASK-205.5
title: 'Reading ruler: line focus overlay that follows reading position'
status: To Do
assignee: []
created_date: '2026-10-20 22:23'
updated_date: '2026-10-20 22:35'
labels:
  - reader
  - accessibility
milestone: m-13
dependencies:
  - TASK-205.9
parent_task_id: TASK-205
priority: low
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Kindle, Readest and dyslexia apps offer a reading ruler. It highlights or frames the current line or lines and dims the rest of the page, which helps readers with dyslexia or ADHD keep their place. Lesefluss has only a 2px active-word underline.

Add an optional reading ruler that marks the line or lines containing the active word. It follows the spoken word during read-aloud. Outside read-aloud it sits on the current active word, which the user sets with the existing word tap. No new gesture is added: taps are already taken (first tap sets the position, a second tap opens the dictionary, highlight or glossary, and during read-aloud a tap calls moveTo; reader/index.tsx ~1061-1081). There is no scroll-follow apart from read-aloud follow.

The ruler is a visual aid only. It must never write the reading position, never scroll and never turn pages.

Progress risks from the 2026-10-21 review:
- Scroll settles go through handleSetProgressWord, which sets userMovedRef. Page turns settle the same way. The unmount and pagehide flushes persist lastWordRef. So any ruler-driven scroll or page turn would save a position.

Performance and interaction notes:
- The spoken-word tick is already imperative (spoken-word.ts uses the CSS Highlight API, and followWord calls getBoundingClientRect once per word). Calling getClientRects on the same span right after adds no new layout. Moving the overlay with transform is compositor-only.
- Putting the ruler in React state would re-render every visible memoised Paragraph on each word.
- Page mode puts content in a translateX wrapper. A hyphenated word returns rects in two columns, so use the rect on the current page (see measurements.ts). During a chunk crossing the target rect is stale.
- The overlay must be pointer-events:none, or it breaks word taps, long-press selection, links and figure long-press.
- Old WebViews without CSS.highlights need their own feature check. On e-ink, a moving overlay forces a partial refresh on every line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Reading ruler toggle and line count (1-3) in the Appearance popover and Settings > Reader; default off
- [ ] #2 Ruler highlights the line(s) containing the active word and dims the rest in scroll and page mode
- [ ] #3 Ruler follows the spoken word during read-aloud
- [ ] #4 Ruler placement uses existing word-tap semantics (tap = set position, second tap = dictionary/highlight); no new tap gesture is added and nothing ruler-specific saves a position
- [ ] #5 Toggling, moving or resizing the ruler never calls savePosition, never sets userMovedRef/lastWordRef, and never scrolls or turns a page
- [ ] #6 After using the ruler and closing the book, reopening restores the same first word as without the ruler (scroll and page mode, sync off)
- [ ] #7 Ruler moves via direct DOM/transform, not React state per spoken word; overlay is pointer-events:none so taps, long-press selection, links, highlights and image long-press behave unchanged
- [ ] #8 Page mode: ruler uses the rect on the current page for words split across columns and is hidden during page/chunk transitions
- [ ] #9 Ruler static (no animated movement) under E-ink mode and reduce-motion; feature-detected on old WebViews
- [ ] #10 Ruler stays aligned after font size, spacing or orientation changes
- [ ] #11 Setting syncs between devices
- [ ] #12 pnpm build and Android build succeed; new Playwright e2e specs cover ruler toggle/read-aloud without position change and reopen-restores-same-word in scroll and page mode; existing position-*, page-mode-* and jump-settle-guard e2e specs pass
<!-- AC:END -->
