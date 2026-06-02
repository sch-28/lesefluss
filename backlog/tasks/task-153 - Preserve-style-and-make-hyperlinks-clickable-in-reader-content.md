---
id: TASK-153
title: 'Preserve, style, and make hyperlinks clickable in reader content'
status: In Progress
assignee: []
created_date: '2026-05-31 21:40'
updated_date: '2026-06-01 23:54'
labels:
  - reader
  - import
  - ux
dependencies: []
references:
  - packages/book-import/src/utils/dom-paragraphs.ts
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/web/src/lib/article-import.ts
  - apps/capacitor/src/pages/reader/use-link-decorations.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/drizzle/0028_link_ranges.sql
  - apps/web/drizzle/0013_link_ranges.sql
  - >-
    backlog/tasks/task-155 -
    Intra-book-anchor-navigation-in-reader-footnotes-cross-references.md
priority: medium
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported content lost all hyperlinks: the import pipeline (`packages/book-import/src/utils/dom-paragraphs.ts`) extracted text only and dropped `<a>` tags, so EPUB and imported articles/URLs rendered as plain text. Users reading articles/links expect inline hyperlinks to be visible and tappable.

This task covers EXTERNAL (http/https) hyperlinks: captured at import, stored as word-position ranges, synced, rendered styled + clickable in scroll/page/RSVP, opening in the system browser. Plus a render-time pass that linkifies bare URLs already present as text (works on books imported before capture).

Out of scope: intra-book anchor navigation (`href="#id"`, relative/footnote/cross-ref links) is deferred to task-155.

User value: imported articles and links read as intended instead of stripped plain text. Addresses reviewer feedback on link visibility.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Import captures external (http/https) links as word ranges for EPUB and article/URL content; anchor/relative/dangerous schemes dropped (intra-book anchors deferred to task-155)
- [x] #2 Link metadata stored per book and synced across devices (mobile bookContent + server syncBooks columns, byte->word conversion at import)
- [x] #3 Reader renders inline links without breaking word-position tracking, highlights, selection, or glossary markers
- [x] #4 Links styled with primary color + underline; web build adds hover (focus-visible styles present; full keyboard focus via tabindex deferred)
- [x] #5 Bare http(s) URLs in plain text are linkified at render, covering books imported before link capture
- [x] #6 Tapping an external link opens it in the system browser
- [x] #7 RSVP: linked words marked during playback; tapping a linked context word opens it when paused
- [x] #8 Tests cover link extraction in the import pipeline (unit) and link render + activation in scroll and page modes (e2e)
- [ ] #9 Behavior verified across all 3 themes (dark, sepia, light) on both mobile (Capacitor) and web builds
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Slice 1 (external links) implemented. Capture: dom-paragraphs.ts extractParagraphsWithLinks (http/https only, normalized-text offsets); threaded through epub.ts + html.ts as content-byte ranges. Store: ImportLink type; addBookWithContent converts byte->word via WordIndex; new link_ranges column on bookContent (capacitor migration 0028) and syncBooks (web migration 0013, hand-written per repo convention). Sync: SyncBookSchema.linkRanges + bookToSync push + addServerBookWithContent pull; web article-import converts byte->word server-side with WordIndex so format matches the device. Render: use-link-decorations.ts (stored links + bare-URL regex, overlap dedup, trailing-punct trim); paragraph.tsx .word-link class on the onClick path (gesture/selection/glossary untouched); threaded through scroll-view + page-view/chunk-content; handleLinkTap -> Browser.open + DEV publishLinkOpen hook. RSVP: rsvp-view marks focal/context link words, context tap opens when paused. CSS: .word-link + .rsvp-*-link in monochrome.css using --primary.

Tests: book-import link-ranges.test.ts (capture, multi-link, dangerous-scheme drop, EPUB integration); web article-import.test.ts (byte->word + anchor drop); e2e links.spec.ts (stored link render+tap, bare-URL render+tap). check-types tsc 0 + 234 unit (capacitor), web tsc 0 + 12, core 66, book-import 25; e2e 32/32.

Remaining for done: manual verification across the 3 themes on mobile + web (AC last item). Also fixed a pre-existing stale web test (position:0, dropped in migration 0012). Intra-book anchors -> task-155.
<!-- SECTION:NOTES:END -->
