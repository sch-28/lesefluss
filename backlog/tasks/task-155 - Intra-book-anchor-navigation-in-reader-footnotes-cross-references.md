---
id: TASK-155
title: Intra-book anchor navigation in reader (footnotes / cross-references)
status: To Do
assignee: []
created_date: '2026-06-01 22:32'
labels:
  - reader
  - import
  - epub
  - deferred
dependencies: []
references:
  - >-
    backlog/tasks/task-153 -
    Preserve-style-and-make-hyperlinks-clickable-in-reader-content.md
  - packages/book-import/src/parsers/epub.ts
  - apps/capacitor/src/pages/reader/index.tsx
priority: low
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to task-153 (external hyperlinks). task-153 ships external http/https links only; in-content anchors are deferred here.

EPUBs contain in-content links that point WITHIN the book: `href="#anchorId"` (footnotes, cross-references) and relative chapter hrefs (`chapter2.xhtml`, `chapter2.xhtml#sec`). task-153 drops these at capture (only http/https is kept) so they render as plain text, not dead links.

Goal: resolve these targets to word positions and jump on tap, reusing the existing `jumpToWord` path (same one TOC chapter jumps use). This needs an anchor-id index built at import: crawl spine items for element ids (`<a id>`, `<h1 id>`, etc.), map each anchor id to its byte/word position, then resolve in-content `#id` / relative hrefs against it. Store resolved targets as word-position link ranges alongside the external ones from task-153.

User value: tapping a footnote marker or cross-reference jumps to the target inside the book, like a real EPUB reader.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Import builds an anchor-id index (element id -> word position) across EPUB spine items
- [ ] #2 In-content `href="#id"` and relative chapter hrefs resolve to a word position and are stored as link ranges (distinct type from external links)
- [ ] #3 Tapping a resolved in-content link jumps within the book via the existing jumpToWord path (scroll/page/RSVP)
- [ ] #4 Unresolvable anchors degrade gracefully (render as plain text, no dead tap)
- [ ] #5 Works alongside external links from task-153 without regressing them
- [ ] #6 Unit test for anchor-id resolution + e2e smoke for tap-to-jump
<!-- AC:END -->
