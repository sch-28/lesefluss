---
id: TASK-177.2
title: >-
  Reader: render stored EPUB images in scroll and page mode with theme-aware
  styling
status: Done
assignee:
  - claude
created_date: '2026-10-01 10:07'
updated_date: '2026-10-01 12:31'
labels:
  - reader
dependencies:
  - TASK-177.1
modified_files:
  - apps/capacitor/src/pages/reader/reader-figures.ts
  - apps/capacitor/src/pages/reader/reader-figure.tsx
  - apps/capacitor/src/pages/reader/reader-figures.test.ts
  - apps/capacitor/src/pages/reader/paragraph.tsx
  - apps/capacitor/src/pages/reader/scroll-view.tsx
  - apps/capacitor/src/pages/reader/page-view/index.tsx
  - apps/capacitor/src/pages/reader/page-view/chunk-content.tsx
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/services/db/hooks/query-keys.ts
  - apps/capacitor/src/services/db/hooks/use-books.ts
  - apps/capacitor/src/services/db/hooks/index.ts
  - apps/capacitor/src/theme/monochrome.css
  - apps/capacitor/e2e/reader-images.spec.ts
  - agents/capacitor.md
parent_task_id: TASK-177
priority: medium
ordinal: 115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome

The reader shows a book's stored images as block figures at their anchored positions, in scroll mode and page mode, styled per theme, without disturbing position tracking. Parent TASK-177 holds the rationale and decided constraints; the essentials are restated here.

## Inputs this task consumes (produced by the sibling import subtask)

- A per-book list of image anchors: `{ word, imageKey, alt, width, height, isLineArt }` where `word` is the word index the image precedes (equal to the word count for a trailing image).
- A per-book image store in SQLite keyed by `imageKey` with mime type and bytes.

## Constraints

- Images are block elements rendered above the paragraph whose first word equals the anchor word, in the same slot the inline chapter heading already uses (`chapterHeadingByParagraph` in `index.tsx` / `Paragraph`'s `chapterHeading` prop). A trailing image renders after the last paragraph. When a chapter-title image and the TOC-derived inline heading would both appear for the same paragraph, show both; do not suppress either in v1.
- Images carry no `data-word` spans and are never a reading position. Scroll-position save, fine-scroll alignment, page-index measurement and the progress bar must behave as before (they only look at `span[data-word]`).
- Reserve space before load: size the figure box from the stored width/height (aspect ratio) so neither virtua's height reconciliation in scroll mode nor the multicol pagination in page mode shifts when the image decodes. Max width is the text column; page mode additionally caps height to the page and prevents a figure from splitting across columns.
- Bytes are loaded lazily per book (not inlined into the paragraph list memo) and exposed to the DOM as data or blob URLs, both allowed by the web CSP.
- Theme styling: light shows the image as-is; sepia blends white image backgrounds into the page colour; dark inverts images flagged `isLineArt` so black line art reads as light lines on the dark page, and leaves other images untouched. No user setting.
- Missing bytes for an anchor (e.g. anchor synced but bytes device-local): render nothing for that anchor, no placeholder, no error.
- RSVP mode and ESP32 upload ignore images entirely.
- Set `draggable={false}` on every `<img>` in the reader; long-press on a draggable image wedges touch dispatch in WebView 148.
- Existing books with no stored images render exactly as before.

## Pointers

`apps/capacitor/src/pages/reader/index.tsx` (paragraph maps, data loading via `queryHooks`), `paragraph.tsx`, `scroll-view.tsx` (VList, `scheduleFineScroll`), `page-view/index.tsx`, `page-view/chunk-content.tsx`, `page-view/measurements.ts`, `chapter-headings.ts`, `apps/capacitor/src/theme/monochrome.css` (`.reader-paragraph`, `.reader-heading`, theme classes), `apps/capacitor/src/components/cover-image.tsx` (aspect-box + fade-in pattern), `apps/capacitor/src/services/db/hooks/use-books.ts`. `agents/capacitor.md` "Book Reader" section documents the paragraph pipeline; update it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A newly imported illustrated EPUB shows every stored image above the paragraph it precedes, in scroll mode and in page mode, and a trailing image appears after the last paragraph
- [x] #2 Opening the book at a saved position, scrolling, tapping words, chapter jumps and progress-bar scrubbing behave the same as on a book without images (reader tests pass unchanged)
- [x] #3 The figure box has its final size before the image loads: no visible layout jump in scroll mode and page count does not change after images decode
- [x] #4 In page mode a figure never splits across two pages and never exceeds the page height
- [x] #5 Light theme shows images unmodified; sepia theme shows no white rectangle around line art; dark theme shows line-art images with light strokes on the dark page and leaves photos uninverted
- [x] #6 An anchor whose bytes are not stored renders nothing and logs nothing visible to the reader
- [x] #7 Every reader <img> is non-draggable
- [x] #8 Books with no stored images render identically to before (no extra DOM nodes)
- [x] #9 agents/capacitor.md Book Reader section documents image rendering and the anchor-to-paragraph mapping
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan

1. `pages/reader/reader-figures.ts` (pure): `ReaderFigureData = { bookId, key, alt, width, height, isLineArt }` and `buildFigureMap(bookId, anchors, imageMeta, paragraphStartWords, totalWords)` → `{ byParagraph: Map<number, ReaderFigureData[]>, trailing: ReaderFigureData[] }`. Anchor word ≥ totalWords → trailing; otherwise the paragraph whose start word is ≤ the anchor word (`paragraphIndexForWord`), so an image renders above the paragraph that contains or starts at its word. Anchors with no stored metadata are dropped (missing bytes → nothing rendered). Unit test alongside `chapter-headings.test.ts`.
2. `pages/reader/reader-figure.tsx`: `<ReaderFigure data>` loads the data URL with `useQuery(bookKeys.image(bookId, key), queries.getBookImageData)` (`staleTime` ∞). Renders `<figure class="reader-figure [reader-figure--line-art]">` with `<img width height draggable={false} decoding="async" alt>`; the width/height attributes reserve the aspect box before the bytes arrive. Null result → renders nothing. Key hierarchy stays under `['books', id, …]` so the existing delete-path `removeQueries` drops image queries too.
3. `services/db/hooks`: `bookKeys.images(id)`, `bookKeys.image(id, key)`, `useBookImages(id)` (metadata, `staleTime` ∞).
4. `paragraph.tsx`: new `figures?: ReaderFigureData[]` prop. Rendered before the chapter heading and before the paragraph, in both the heading branch and the body branch (a heading paragraph can carry an image too: a map page carried into a chapter anchors at its injected `# ` heading). No `data-word` spans.
5. `scroll-view.tsx`: `figuresByParagraph`, `trailingFigures` props; trailing figures render after the last paragraph, before `footer`.
6. `page-view/index.tsx` + `chunk-content.tsx`: same props; trailing figures render in the chunk whose `paragraphTo === paragraphs.length`. Chunk container exposes `--reader-page-height` so CSS can cap figures to the page.
7. `index.tsx`: `imageAnchors` from `queries.parseImageAnchors(contentRow.imageAnchors)`, `useBookImages(id)`, `useMemo` → `buildFigureMap`, pass to both views. Books without anchors produce an empty map, so nothing changes for them.
8. `theme/monochrome.css`: `.reader-figure` (block, centred, `max-width: 100%`, `break-inside: avoid`, `max-height: calc(var(--reader-page-height, 100vh) - 2em)`, img `object-fit: contain; height: auto`), sepia `mix-blend-mode: multiply`, dark + `--line-art`: `filter: invert(1); mix-blend-mode: screen`.
9. Docs: `agents/capacitor.md` Book Reader section.

Tests: `reader-figures.test.ts` (paragraph mapping, trailing, missing metadata, heading paragraph). Existing reader suites must pass unchanged. Manual: Morning Star on device (scroll + page, three themes) after a build; noted as unverified here if no device is available.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Data contract delivered by TASK-177.1: `bookContent.imageAnchors` JSON is `[{ word, key, alt }]` (parse with `queries.parseImageAnchors`); per-image metadata (`key, mime, width, height, isLineArt`) comes from `queries.getBookImages(bookId)` (no bytes); one payload as a data URL from `queries.getBookImageData(bookId, key)` (null when not stored). Join anchors to metadata by `key`.

Blend modes had no visible effect at first: virtualised list items are isolated stacking contexts, so the img's backdrop did not include the page background. Fix: `.reader-figure { background: var(--reader-bg) }` puts the page colour directly under the image; sepia multiply and dark invert+screen then work as intended. Verified with screenshots.

Visual check in Chromium with the real "Morning Star" EPUB (Playwright, temporary spec, removed afterwards): parse 1.7 s, commit 1.7 s; the cover page and title page render as the first two figures; title page (black on white) is flagged line art and inverts on dark, the colour cover is not flagged and stays as-is; sepia blends the white background away; light unchanged. Page mode shows the cover as a full page without splitting, text continues on the next page. `detectLineArt` therefore works on a Chromium WebView-class engine; an Android device run is still outstanding.

The EPUB's cover page (`cover.xhtml` in the spine) is captured as a body image and renders first in the reader. Intentional: that is the first page of the book in every other reader. The library cover thumbnail is unaffected (separate `cover_image`).

Tests: `reader-figures.test.ts` (6), e2e `reader-images.spec.ts` (scroll + page on the image fixture, asserts 5 figures, `width`/`height`/`draggable` attributes, no `data-word` inside figures, first and last block are figures). Full capacitor suite 758 ✓, tsc clean, Biome clean on touched files. Reader e2e regression set (highlights, highlights-modes, jump-settle-guard, links, import-epub, book-detail-chapter-jump, page-mode turn/progress-bar/appearance-anchor) 12/12 ✓.

Review pass fixes on the reader side: (1) trailing figures are VList siblings of `<Paragraph key={i}>`, and virtua keys items by element key, so a numeric figure key could collide with a paragraph key; keys are now `figure-<id>`; (2) page-mode `ChunkContent` re-measures its column width when `figuresByParagraph` / `trailingFigures` change (images metadata usually resolves after the first measure), and the reader skeleton now also waits for the images query so the first paint already has figures; (3) a sized figure owns its box via inline `aspect-ratio` + `max-width: min(100%, Wpx)` (`.reader-figure--sized`), the img fills it, and the `<img>` is only mounted once the data URL is known, so Chrome no longer paints alt text into the box while bytes load; figure height is capped under `--reader-page-height` for page mode. Known residual: an image whose header could not be sniffed (width/height 0) reserves no box and can shift layout on decode. Re-verified: capacitor 793 tests, e2e image + page-mode + highlight specs, Chromium screenshots of the real book (cover 372x571 box, title page 372x585, page mode one figure per page).

Review round 2 (two fresh reviewers with the team convention texts inlined, covering the post-round-1 fixes and TASK-178). Reader fixes: figure placement now resolves the paragraph by the anchor word's byte against `paragraphOffsets` instead of by floored paragraph start words (a one-word `# ` heading directly followed by another heading misplaced a carried-over image; unit test added); unsized figures (header not sniffable: BMP, TIFF, unit-less SVG) get a fixed 4:3 box so page-mode chunk measurement cannot go stale when the img mounts; image payload query key is a sibling of the metadata key (`["books", id, "image", key]`) so metadata invalidations do not refetch every mounted payload, with `gcTime` 60 s; `useBookImageData` hook extracted into `use-books.ts`; `useMemo` on the host style dropped; `type` over `interface`; `MAX_LINE_ART_PIXELS` no longer exported; DOM lib types used directly in `detectLineArt`; CSS max-height named once. e2e: `expectNoHighlight` first requires the span to exist (a negated matcher passes on a missing element); the no-op `turnPages(page, 0)` lines removed from `reader-images.spec.ts`. Suites: book-import 79, capacitor 821, e2e image + highlight + page-mode + import specs all green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

Stored EPUB images now render in the reader, in scroll and page mode, placed above the paragraph they precede and styled per theme.

- `reader-figures.ts`: pure `buildFigureMap` joins `book_content.image_anchors` with `book_images` metadata and keys figures by paragraph (`paragraphIndexForWord`); anchors at or past the word count become trailing figures; anchors without stored metadata are dropped.
- `reader-figure.tsx`: `<ReaderFigure>` loads one data URL via `bookKeys.image(bookId, key)` (staleTime ∞), renders `<figure class="reader-figure [--line-art]"><img width height draggable=false decoding=async>`; renders nothing when the store has no bytes.
- `paragraph.tsx`: `figures` prop rendered before the inline chapter heading and the text, also for `# ` heading paragraphs. No `data-word` spans, so position save, alignment, pagination and the progress bar ignore figures.
- `scroll-view.tsx`, `page-view/index.tsx`, `chunk-content.tsx`: `figuresByParagraph` + `trailingFigures` threaded through; trailing figures render after the last paragraph (scroll) or in the chunk holding the last paragraph (page). Chunks expose `--reader-page-height`.
- `index.tsx`: parses anchors, loads metadata with `useBookImages`, memoised `buildFigureMap`, passes to both views. Books without anchors get an empty map and render as before.
- `monochrome.css`: `.reader-figure` block with page background (needed because virtualised items are isolated stacking contexts), `break-inside: avoid`, img capped to `--reader-page-height`; sepia `mix-blend-mode: multiply`; dark inverts only `--line-art` and screens it into the page.
- Hooks: `bookKeys.images/image`, `useBookImages`.
- Docs: `agents/capacitor.md` Book Reader section.

## Tests
- Unit: `reader-figures.test.ts` (6). Full capacitor suite 758 ✓, tsc clean, Biome clean.
- E2E: new `reader-images.spec.ts` (scroll + page) ✓; reader regression set 12/12 ✓.
- Visual (Chromium, real "Morning Star" EPUB): figures at correct positions, line-art inversion on dark, sepia blend, light unchanged, page mode cover as one page.

## Follow-ups / risks
- Android WebView run still outstanding (Chromium verified).
- Cover page renders as the first figure; expected but worth a glance in the app.
- Figure captions remain dropped at import (TASK-177.1 note).
<!-- SECTION:FINAL_SUMMARY:END -->
