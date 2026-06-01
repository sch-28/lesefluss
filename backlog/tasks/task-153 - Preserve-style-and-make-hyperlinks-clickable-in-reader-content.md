---
id: TASK-153
title: 'Preserve, style, and make hyperlinks clickable in reader content'
status: To Do
assignee: []
created_date: '2026-05-31 21:40'
updated_date: '2026-06-01 19:56'
labels:
  - reader
  - import
  - ux
dependencies: []
references:
  - packages/book-import/src/utils/dom-paragraphs.ts
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/web/src/lib/article-import.ts
priority: medium
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported content currently loses all hyperlinks: the import pipeline (`packages/book-import/src/utils/dom-paragraphs.ts`) extracts text only and drops `<a>` tags, so EPUB and imported articles/URLs render as plain text with no links. Users reading articles/links expect inline hyperlinks to be visible and tappable.

Goal: carry link metadata through import, render links inline in the reader, style them clearly (primary color, underline, focus/hover states for the web build), and make them activatable. Internal EPUB links (intra-book anchors) should navigate within the book; external URLs should open in the system browser.

User value: imported articles and links read as intended instead of stripped plain text. Addresses reviewer feedback on link visibility.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Import pipeline preserves hyperlink href + anchor text/range for both EPUB and imported article/URL content
- [ ] #2 Reader renders inline links within text without breaking word-position tracking, highlights, selection, or glossary markers
- [ ] #3 Links styled with primary color and underline; web build adds visible hover and focus states
- [ ] #4 Tapping an external link opens it in the system browser; intra-book anchor links navigate to the target position within the book
- [ ] #5 Behavior verified across all 3 themes (dark, sepia, light) on both mobile (Capacitor) and web builds
- [ ] #6 Tests cover link extraction in the import pipeline and link rendering/activation in the reader
- [ ] #7 RSVP mode: linked words are visibly marked during playback, and activatable when paused or via the RSVP context view (external -> system browser, intra-book anchor -> jump to target word)
- [ ] #8 Link rendering/activation verified in all three reader modes: scroll, page, and RSVP
<!-- AC:END -->
