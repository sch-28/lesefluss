---
id: TASK-176
title: >-
  Explore overhaul: search, tags, filters and a landing page that knows the
  reader
status: To Do
assignee: []
created_date: '2026-10-01 10:03'
labels:
  - explore
  - ux
milestone: m-6
dependencies: []
references:
  - apps/capacitor/src/pages/explore
  - apps/catalog/src/routes/search.ts
  - apps/catalog/src/lib/genres.ts
  - TASK-67
  - TASK-68
documentation:
  - EXPLORE-SCOPE.md
priority: high
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Explore tab (`/tabs/explore`) feels rough. A UI/UX review (2026-10-01, written up in `EXPLORE-SCOPE.md` at the repo root) found:

- Explore is two disconnected products. The public-domain catalog (Gutenberg + Standard Ebooks, served by `apps/catalog`) and web novels (Royal Road, ScribbleHub, AO3, FF.net, Wuxiaworld via `services/serial-scrapers`) have separate search, filters, layouts and detail pages. Header search does not find web novels; the language picker does nothing on the web-novel page.
- Catalog books carry rich subjects/tags (Gutenberg LCSH headings, SE OPDS categories) but they are display-only. A user cannot find "short stories" except by typing it into full-text search.
- Filtering is one genre out of 8 hard-coded ones plus a language select. No sort, no source filter, no length filter.
- Results use numbered pagination on a phone, have no "already in library" marker, no list view, spinner-only loading, no retry on catalog errors.
- Landing is a wall of same-shaped shelves with zero personalization; genres appear twice.
- Catalog detail ends the flow by jumping to the library; facts like length/language/year are missing; author and subjects are not tappable.
- Web-novel preview breaks on deep link/reload (in-memory `previewCache`) and lacks tags/status/rating.

This parent tracks the overhaul. Subtasks are independently shippable; backend (catalog) subtasks are prerequisites for some UI subtasks and are wired as dependencies. Existing related tasks: TASK-67 (short reads filter, needs word counts) and TASK-68 (curated article sources on Explore).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All subtasks are Done or explicitly descoped with a note
- [ ] #2 EXPLORE-SCOPE.md items are each covered by a subtask, an existing task (TASK-67, TASK-68), or marked out of scope
<!-- AC:END -->
