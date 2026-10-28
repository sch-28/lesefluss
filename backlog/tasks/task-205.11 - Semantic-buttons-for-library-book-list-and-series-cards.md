---
id: TASK-205.11
title: 'Semantic buttons for library book, list and series cards'
status: To Do
assignee: []
created_date: '2026-10-28 18:57'
updated_date: '2026-10-28 19:15'
labels:
  - accessibility
  - library
milestone: m-14
dependencies: []
parent_task_id: TASK-205
priority: low
ordinal: 195000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up from TASK-205.6 (2026-10-28). Library book cards (pages/library/book-card.tsx), list items (book-list-item.tsx) and series cards (series-card.tsx) are clickable divs: useLongPress spreads onClick/onTouch*/onContextMenu onto a plain div. A TalkBack double-tap opens them (they open on click), but they are not announced as buttons, and keyboard users cannot focus or activate them. Adding role=button to the div trips biome a11y lint (useSemanticElements, useFocusableInteractive). A real <button> would nest the card's own controls (device badge, selection check), so this needs a small restructure: e.g. a full-card button as the primary target with the badges as siblings, keeping long-press menus and selection mode.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Library book, list and series cards are announced as buttons with the book or series title as name
- [ ] #2 They are reachable and activatable by keyboard (Tab, Enter/Space) and TalkBack
- [ ] #3 Tap, long-press menu, right-click menu and selection mode behave unchanged
- [ ] #4 No nested interactive elements; biome a11y lint passes without suppressions
- [ ] #5 In selection mode each card exposes its selected state (aria-pressed or aria-selected)
<!-- AC:END -->
