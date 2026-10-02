---
id: TASK-176.12
title: 'Want to read: save a catalog or web-novel title without downloading it'
status: To Do
assignee: []
created_date: '2026-10-01 10:05'
updated_date: '2026-10-02 16:59'
labels:
  - explore
  - library
milestone: m-14
dependencies: []
references:
  - TASK-164.2
documentation:
  - EXPLORE-SCOPE.md
parent_task_id: TASK-176
priority: low
ordinal: 107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: browsing produces "maybe later" picks. Today the only way to remember one is a full import, which fills the library with books the reader has not committed to. Library books already have an explicit reading status (TASK-164.2), but that requires the book to exist locally.

Outcome: readers can bookmark titles from Explore and later import them in one tap.

Open question for the implementer: whether this is a separate wishlist or a lightweight library entry with status 'want to read' and no content. Decide before building; the choice affects sync.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Catalog detail and web-novel preview offer a 'Want to read' toggle
- [ ] #2 Saved titles are listed in a findable place with one-tap import
- [ ] #3 Saved titles sync across devices for signed-in users and persist locally for no-account users
- [ ] #4 Importing a saved title clears it from the saved list
- [ ] #5 Tests cover save, unsave, list, import-from-saved and sync round-trip
<!-- AC:END -->
