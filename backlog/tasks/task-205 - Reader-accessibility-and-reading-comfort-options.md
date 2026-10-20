---
id: TASK-205
title: Reader accessibility and reading comfort options
status: To Do
assignee: []
created_date: '2026-10-20 22:22'
updated_date: '2026-10-20 22:35'
labels:
  - reader
  - accessibility
milestone: m-13
dependencies: []
references:
  - >-
    https://aboutamazon.com/news/books-and-authors/kindle-accessibility-features-for-all-readers
  - 'https://thorium.edrlab.org/docs/300_accessibility/'
  - 'https://www.edrlab.org/accessibility/epub-and-dyslexia/'
  - 'https://about.ebooks.com/one-click-dyslexia-mode-for-ebooks/'
priority: medium
ordinal: 172000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Other reading apps (Kindle, Apple Books, Thorium, Readest, Moon+) ship common accessibility and comfort options that Lesefluss lacks. Today the reader offers only two font families (Sans = system default, Serif = Georgia), font size, line height, horizontal margins, Dark/Sepia/Light themes, an E-ink mode, an active-word underline, read-aloud with word tracking, RSVP and a dictionary.

Gap analysis (2026-10-21) found these missing:
- dyslexia-friendly and low-vision fonts
- letter, word and paragraph spacing
- justified text, with hyphenation in scroll mode
- a bold text option
- a high-contrast theme outside E-ink mode
- a reading ruler / line focus
- screen-reader access to book text
- respect for the OS font scale and reduce-motion

Decisions:
- Ship these as individual options, not as a single "dyslexia mode" preset. Research on dyslexia fonts is mixed, and how much spacing helps varies by reader.
- Out of scope: bionic reading, which has weak evidence, and BeeLine-style colour gradients, which are proprietary.

Each subtask is one independently shippable PR. Typography options should follow the existing reader settings path: a settings row in the DB schema and migration, packages/core settings ranges, the sync schema in packages/core/src/sync.ts, the reader Appearance popover, and Settings > Reader. They must work in both scroll and page mode. Page mode must re-paginate without losing the reading position.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All subtasks done
- [ ] #2 Changelog entry describes the new reading options
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-21 review (3 agents, focused on reader performance and progress safety). Two prerequisites were added and must land first:
- TASK-205.8: scroll mode never re-anchors after a layout change. This is an existing bug, and every new layout setting would add another trigger.
- TASK-205.9: the server rejects a whole sync push when it contains an unknown settings enum value, and an old client's push resets fields it doesn't know.

Every subtask that touches layout or position must:
- keep the saved word unchanged when its setting changes, locally or through sync, in both scroll and page mode
- restore the same first word on reopen
- add each layout value to the page-mode layoutKey AND the chunk measure deps AND the scroll layout key
- pass pnpm build, the Android build, new e2e specs for its progress risks, and the existing position-*/page-mode-* e2e suites

Order: 205.9 and 205.8, then 205.2, 205.1, 205.3, 205.4, 205.7, 205.5 and 205.6.
<!-- SECTION:NOTES:END -->
