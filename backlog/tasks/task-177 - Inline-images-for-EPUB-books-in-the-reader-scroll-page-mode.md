---
id: TASK-177
title: Inline images for EPUB books in the reader (scroll + page mode)
status: Done
assignee: []
created_date: '2026-10-01 10:06'
updated_date: '2026-10-02 16:49'
labels:
  - reader
  - book-import
dependencies: []
references:
  - >-
    Morning Star - Pierce Brown.epub (sample with 76 images, repo root,
    untracked)
documentation:
  - agents/capacitor.md
  - backlog/docs/doc-2 - Book-import-architecture-—-state-amp-roadmap.md
priority: medium
ordinal: 113000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

EPUB images are dropped silently at import today. `packages/book-import/src/utils/dom-paragraphs.ts` only visits heading, `P`, `LI` and container tags; `<img>`, `<figure>` and SVG `<image>` are never seen, alt text included. Only the cover survives. A reader who opens an illustrated book (maps, chapter art, family trees, plates, scene-break ornaments) sees nothing where the picture should be and assumes the import broke. Every comparable reader shows them.

Sample: "Morning Star" (Kindle-sourced EPUB) has 99 spine files, 76 images, 3.0 MB total: ~30 chapter-title images (~35 KB each, alt text like "4 Cell 2187"), a handful of 100-150 KB maps, and Kindle `data-amznremoved` twins (same `src` emitted twice per block).

## Hard constraints (decided)

- `book_content.content` stays plain text, byte-identical to what is produced today. Every position in the app (reading position, highlights, chapters, links, buddy-read markers, stats, ESP32 upload, RSVP) is a word index from `WordIndex` built on that text, so images must never add or remove words. Images live in a sidecar keyed by word position, the same pattern as `chapters` and `linkRanges`.
- Image bytes stored in SQLite (new table), on web and native alike. The original `.epub` on disk is native-only and not read back today; the web build has no original at all.
- EPUB only in v1. HTML/URL imports and serial scrapers are out of scope.
- New imports only. No re-extraction for existing books.
- Image bytes are NOT synced. Anchors (sidecar JSON) may sync like chapters/linkRanges but bytes stay device-local. `syncBooks.content` cap and server storage are untouched.
- Keep all images, including small ornaments. No size threshold. Scene-break glyphs and chapter marks are meaningful.
- Both scroll mode and page mode render images. RSVP mode and ESP32 ignore them.
- Theme handling: light as-is; sepia blends the white image background into the page; dark theme inverts images detected as monochrome line art at import, photos and colour images stay as-is (white box is acceptable). Detection happens once at import (canvas pixel sampling: near-grayscale plus bright borders) and is stored per image as a flag. No user-facing toggle.
- Reserve layout space before the image loads: intrinsic width/height stored at import so scroll virtualisation (virtua VList) and page-mode multicol measurement do not shift when the image decodes.

## Structure

Two subtasks, sequential:
1. Import + storage: parser emits image anchors, bytes and metadata persisted, migration, tests.
2. Reader rendering: scroll view, page view, theme CSS, chapter-heading interplay.

## Pointers

- Importer: `packages/book-import/src/utils/dom-paragraphs.ts`, `packages/book-import/src/parsers/epub.ts` (cover extraction already loads blobs from the archive and resolves relative paths), `packages/book-import/src/types.ts` (`BookPayload`), `apps/capacitor/src/services/book-import/commit.ts` (byte→word conversion for links happens here via `byteRangeToWordRange`).
- Schema: `apps/capacitor/src/services/db/schema.ts`, migrations under `apps/capacitor/drizzle/` plus `meta/_journal.json`.
- Reader: `apps/capacitor/src/pages/reader/index.tsx` (per-paragraph maps such as `linksByParagraph`, `chapterHeadingByParagraph`), `paragraph.tsx`, `scroll-view.tsx`, `page-view/`, `chapter-headings.ts` (already special-cases chapters whose title was an image).
- Test fixture builder: `packages/book-import/src/test-fixtures/build-epub.ts` (already zips PNGs for cover tests). Note happy-dom is lenient about HTML quirks; verify on a real WebView build.
- Web CSP allows `img-src 'self' data: blob:` so data/blob URLs work on web.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening a newly imported EPUB that contains images shows each image at the position it occupies in the source, in both scroll mode and page mode
- [x] #2 book_content.content for an EPUB with images is byte-identical to what the importer produced before this feature, and word count, reading position, highlights, chapter offsets and ESP32 upload are unaffected
- [x] #3 Image bytes are stored in SQLite and available on web and native builds; they are never included in the sync payload
- [x] #4 Dark theme inverts monochrome line-art images and leaves photos and colour images untouched; sepia blends white image backgrounds into the page; light theme shows images as-is
- [x] #5 Layout does not shift when an image finishes loading, in either reading mode
- [x] #6 Existing books without stored images continue to render exactly as before
- [x] #7 Both subtasks are Done, including their tests and documentation updates
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Two sequential subtasks, one agent (claude):
1. TASK-177.1 import + storage (parser anchors, `book_images` table, `book_content.image_anchors`, tests, docs). In progress.
2. TASK-177.2 reader rendering (scroll + page view, theme CSS, docs). Depends on 177.1. Consumes `queries.getBookImages(bookId)` (metadata: key, mime, width, height, isLineArt) and `queries.getBookImageData(bookId, key)` (base64) plus `bookContent.imageAnchors` JSON `[{ word, key, alt }]`.

Decisions fixed during planning: anchors are not synced in v1 (bytes aren't either, so anchors alone would be dead weight); image key = resolved archive path; images over 4 MB are skipped at import; figure captions remain dropped so `content` stays byte-identical.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Device verification done on the Pixel 8 Pro (debug build): migration 0035 applied, Morning Star and Empire of the Damned imported, figures render in scroll mode with correct line-art handling on the dark theme. Two performance follow-ups were needed and are Done: TASK-177.3 (downscale/re-encode at import, 89 MB → 20 MB for the 47-image book) and TASK-177.4 (worker-side preparation, deferred image writes). Reader reports no lag.

Transition and robustness subtasks added after the device tests and all Done: 177.3 (downscale/re-encode), 177.4 (worker + deferred writes), 177.5 (repair missing rows from the original file), 177.6 (automatic upgrade of pre-image EPUBs on open, removable once libraries have been through it). Four fresh-context review rounds in total; every must-fix applied and re-verified on the Pixel.

TASK-177.7 Done: shared e2e fixtures carry images at every placement, four image-specific progress cases added, full Playwright suite 96/96 green.

TASK-177.8 Done: first touch-input path in the e2e suite (CDP), long-press across a figure and page-mode re-anchoring on a figure page covered. Remaining low-priority gaps (theme styling of figures, missing rows on the web build) documented in 177.7.

TASK-177.9 Done: a re-imported EPUB attaches to the synced copy of the same book (same text, no original on the device), restoring images and the original file without touching progress or sync. Closes the gap that synced libraries stayed image-free on every device except the importing one.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
All eight subtasks done. See TASK-177.1 (import + storage), TASK-177.2 (reader rendering), TASK-177.3 (downscale + responsive sheet), TASK-177.4 (worker + deferred writes), TASK-177.5 (repair missing rows), TASK-177.6 (automatic upgrade of pre-image EPUBs), TASK-177.7 and TASK-177.8 (e2e coverage with image-bearing fixtures, touch and page-mode re-anchor cases) for details.

Net effect: new EPUB imports keep their body images (one `book_images` row per distinct file, anchors in `book_content.image_anchors`), `content` and every word position are unchanged, and the reader shows the images above the paragraph they precede in scroll and page mode with sepia blending and dark-theme inversion of line art. Images are downscaled in a Web Worker and written after the commit, so the confirm sheet never blocks. Lost rows repair themselves from the original file on open; EPUBs imported before this feature gain images automatically on first open without touching progress or sync. Nothing syncs.

Verified: unit suites (book-import, capacitor, core, web) green, full Playwright suite 105 tests green (two unrelated load flakes pass in isolation), Pixel 8 Pro device runs for import, repair and upgrade with the real "Morning Star" and "Empire of the Damned" EPUBs. Five fresh-context review rounds, all must-fix findings applied.

Open, low priority: e2e for sepia/dark figure styling, missing image rows on the web build, figure captions still dropped at import, removal of the automatic upgrade once libraries have migrated.
<!-- SECTION:FINAL_SUMMARY:END -->
