---
id: TASK-177.1
title: >-
  EPUB import: extract inline images into a word-anchored sidecar + SQLite
  storage
status: Done
assignee:
  - claude
created_date: '2026-10-01 10:07'
updated_date: '2026-10-01 12:31'
labels:
  - book-import
dependencies: []
modified_files:
  - packages/book-import/src/utils/dom-paragraphs.ts
  - packages/book-import/src/utils/image-analysis.ts
  - packages/book-import/src/parsers/epub.ts
  - packages/book-import/src/types.ts
  - packages/book-import/src/index.ts
  - packages/book-import/package.json
  - packages/book-import/src/test-fixtures/build-epub.ts
  - packages/book-import/src/__tests__/images.test.ts
  - packages/book-import/src/__tests__/image-analysis.test.ts
  - apps/capacitor/drizzle/0035_book_images.sql
  - apps/capacitor/drizzle/meta/_journal.json
  - apps/capacitor/src/services/db/schema.ts
  - apps/capacitor/src/services/db/queries/books.ts
  - apps/capacitor/src/services/db/queries/index.ts
  - apps/capacitor/src/services/db/__tests__/book-images.test.ts
  - apps/capacitor/src/services/book-import/commit.ts
  - apps/capacitor/src/services/sync/__tests__/book-to-sync.test.ts
  - agents/capacitor.md
parent_task_id: TASK-177
priority: medium
ordinal: 114000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome

An EPUB import records every image in the book body as an anchor keyed to the reading position it precedes, and stores the image bytes plus metadata locally, without changing the plain-text `content` the rest of the app depends on. Parent TASK-177 holds the full rationale and the decided constraints; the essentials are restated here.

## Constraints

- `content` must be byte-identical to today's output for the same EPUB. All positions in the app are word indices over that text (`WordIndex`), so an image contributes zero characters and zero words. Follow the `linkRanges` sidecar pattern: character offset in the parser, UTF-8 byte offset in `BookPayload`, word position at commit.
- An image anchors to the word that follows it in reading order (its "before" word). An image after the last word of the book anchors to the total word count. An image inside a paragraph (drop cap, inline glyph) anchors to that paragraph's first word; v1 does not place images mid-paragraph.
- Capture `<img src>`, `<figure>` wrappers, and SVG `<image href|xlink:href>` in the body. Resolve `src` relative to the section file the same way cover extraction already does (`book.resolve` + `archive.getBlob`). Skip images whose bytes cannot be loaded; never fail the import over an image.
- Deduplicate: the same `src` appearing twice within one block (Kindle `data-amznremoved` twins) yields one anchor. The same `src` used in different places of the book yields one stored blob and several anchors.
- Keep all images regardless of size. No ornament threshold.
- Per image store: mime type, intrinsic width and height in px, alt text (may be empty), and a line-art flag. Line art = near-grayscale pixels with a bright border, sampled once at import on a canvas; photos and colour images are flagged false. If sampling is unavailable (test env, decode failure), flag false.
- Bytes live in a new SQLite table keyed by book id, deleted with the book (`removeBook`, danger-zone wipe, bulk delete). Works on web (sql.js) and native. Base64 text is acceptable, matching how `cover_image` is stored. Watch the sqlite-proxy string limits that `long-text.ts` exists for.
- The anchor list is a JSON sidecar on `book_content` (like `chapters`, `link_ranges`). Image bytes are never added to the sync payload. Whether the anchor JSON syncs is the implementer's call; if it does, it must validate under the existing JSON size cap and a client without the image bytes must degrade gracefully (subtask 2 handles rendering of a missing blob).
- EPUB only. The HTML parser, serial scrapers and PDF stay unchanged.
- Existing books: no backfill, no re-parse.

## Pointers

`packages/book-import/src/utils/dom-paragraphs.ts` (block walk), `packages/book-import/src/parsers/epub.ts` (`extractCover`, `resolveRelative`, `loadSectionBody`), `packages/book-import/src/types.ts`, `apps/capacitor/src/services/book-import/commit.ts`, `apps/capacitor/src/services/db/schema.ts`, `apps/capacitor/src/services/db/queries/books.ts` (`addBookWithContent`, `deleteBook`), `apps/capacitor/drizzle/` + `meta/_journal.json`, `packages/book-import/src/test-fixtures/build-epub.ts`, `packages/book-import/src/__tests__/link-ranges.test.ts` (offset test pattern to mirror). `agents/capacitor.md` documents the DB tables and the import pipeline; update both sections.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Importing an EPUB with images produces the same content string, word count and chapter offsets as before this change (regression test on a fixture with images)
- [x] #2 Each body image yields one anchor whose word position equals the index of the first word following it in reading order; an image after the last word anchors to the word count; an image inside a paragraph anchors to that paragraph's first word
- [x] #3 Images referenced by <img>, inside <figure>, and by SVG <image> are all captured, with src resolved relative to the section file
- [x] #4 Duplicate src within one block produces a single anchor; the same src reused across the book is stored once
- [x] #5 Each stored image carries mime type, pixel width, pixel height, alt text and a line-art flag; a grayscale drawing on white is flagged true, a colour photo false
- [x] #6 Image bytes are stored in a new SQLite table on both web and native and are removed when the book is deleted by any delete path
- [x] #7 Image bytes never appear in the sync payload; the sync test suite still passes
- [x] #8 An image whose bytes cannot be loaded from the archive is skipped with a warning and the import still succeeds
- [x] #9 HTML, PDF and serial-scraper imports are unchanged and their tests pass
- [x] #10 agents/capacitor.md documents the new table, the sidecar field and the anchor semantics
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan

### packages/book-import
1. `utils/dom-paragraphs.ts`: image collection alongside the existing block walk, content output untouched.
   - New `ContentImage = { src, alt, charOffset }`; `extractParagraphsWithLinks` returns `{ content, links, images }`.
   - `collectBlocks`: `IMG`, `PICTURE`, `FIGURE`, `SVG` children become text-less image blocks (figure/picture/svg: inner `img` / `image` elements; figcaption stays dropped as today so content is unchanged). Headings: images inside are captured too (text handling unchanged).
   - `collectRawTextAndLinks` (P/LI walk): nested `<img>`/`<image>` recorded; they anchor at the block start.
   - Anchor rule in `extractParagraphsWithLinks`: an image block's `charOffset` = start of the next non-empty text block, or `content.length` when none follows. Adjacent duplicates (same src, same charOffset: Kindle `data-amznremoved` twins) collapse to one.
   - SVG `<image>`: `href` or `xlink:href`.
2. `utils/image-analysis.ts` (new, pure where possible):
   - `sniffImageDimensions(bytes)`: PNG / JPEG (SOF markers) / GIF / WebP (VP8, VP8L, VP8X) / SVG (`width`/`height` or `viewBox`) → `{ width, height } | null`.
   - `classifyLineArt(rgba, width, height)`: pure pixel rule (sampled grid: ≥ 95 % of pixels near-gray, border mean luminance bright) → boolean. Unit-tested on synthetic buffers.
   - `detectLineArt(blob)`: `createImageBitmap` + `OffscreenCanvas` → `classifyLineArt`; any missing API or decode failure → `false`.
3. `parsers/epub.ts`:
   - Per section: resolve each `src` with the existing `resolveRelative(section.url, src)`, load via `book.archive.getBlob`, dedupe by resolved path across the book (one `ImportImage` per path), skip unloadable or > 4 MB images with a `console.warn`.
   - Image-only sections (currently skipped because `text.length === 0`) carry their images forward to the next section's first anchor; images left over at the end anchor at `content.length`.
   - `injectTocHeading` shifts image offsets like link offsets. Byte offsets computed in the same pass as links.
4. `types.ts`: `ImportImage = { key, mime, dataUrl, width, height, isLineArt }`, `ImportImageAnchor = { key, startByte, alt }`; `BookPayload.images`, `BookPayload.imageAnchors` (null when none). `key` = resolved archive path.
5. `test-fixtures/build-epub.ts`: optional `images: { href, base64, mediaType }[]` added to zip + manifest.

### apps/capacitor
6. Schema + migration `0035_book_images.sql`: `book_images (book_id, key, mime, width, height, is_line_art, data)` PK (book_id, key); `book_content.image_anchors` text (JSON `[{ word, key, alt }]`). Journal entry. Types `BookImage`, `ImageAnchor`.
7. `queries/books.ts`: `addBookWithContent(..., importImages?)` converts anchors with `firstWordAtOrAfter(wi, byte)` (`wordOf` floors; an anchor on a `# ` heading or in the `\n\n` gap must map to the following word; `byte >= content length` → `wordCount`). Image rows inserted after `book_content` inside `commitBookContent`'s try/catch so a failure removes them too. `getBookContent` selects `imageAnchors`. `deleteBook` + `hardDeleteBook` delete `book_images`. New `getBookImages(bookId)` (metadata only) + `getBookImageData(bookId, key)` for subtask 2. Exported via `queries`.
8. `book-import/commit.ts`: pass `payload.images` / `payload.imageAnchors` through.
9. Sync: no change needed; push selects explicit columns. Verified by reading `sync/index.ts`. No anchor sync in v1 (anchors without bytes are useless).

### Tests
- `dom-paragraphs` images (img / figure / svg image / in-paragraph / heading / twins / content identical to before).
- `image-analysis` dimension sniffing (PNG, JPEG, GIF, WebP, SVG) and `classifyLineArt` on synthetic pixels.
- `epub` parser with image fixture: content, chapters, links unchanged; anchors byte-correct; image-only section carried to next; trailing image at `content.length`; dedupe across book.
- capacitor `queries/books` against real SQLite (`__tests__/test-db.ts`): anchor word conversion (heading start, mid-paragraph, trailing), rows written, removed on `deleteBook` / `hardDeleteBook`.

### Docs
- `agents/capacitor.md`: tables list (`book_images`, `image_anchors`), import section (anchor semantics, dedupe, size cap, line-art flag).

### Risks
- happy-dom: parser tests pass but WebView differs; manual check on device with "Morning Star".
- Large image rows cross the Capacitor bridge in one statement (cover does the same today); 4 MB cap bounds it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Anchor rule nuance found while testing: an image in a heading (`<h1><img/></h1>`) anchors to the first *text* after it, so with an injected TOC heading it lands on the first paragraph word, while an image-only page carried in from the previous spine item anchors at 0 (before the injected heading). Both are what a reader expects to see.

`wordOf` floors, so `firstWordAtOrAfter` was needed: anchors on a `# ` marker (the `#` token has no readable char and is dropped by the tokenizer) or in a `\n\n` gap would otherwise map to the previous word.

`IMAGE_BLOCK_TAGS` deliberately do not set `foundBlock` in `collectBlocks`: a wrapper holding only an image plus loose text must still fall through to the textContent path, or `content` would change for existing books.

Figure captions stay dropped (as before) to keep `content` byte-identical. Candidate follow-up: emit figcaption as a paragraph for new imports.

Line-art detection: the pixel rule is unit-tested on synthetic buffers; the `createImageBitmap` + `OffscreenCanvas` path cannot run under happy-dom/node and is unverified on a device in this session. Verify with "Morning Star" on the Pixel when rendering lands (TASK-177.2).

Environment: `@capacitor/network` / `@capacitor/haptics` were declared but missing from node_modules, which failed 5 unrelated capacitor test files; `pnpm install --frozen-lockfile` fixed it (no lockfile change).

Test runs: book-import 76 passed; capacitor 685 passed (57 files); core 142 passed; web 69 passed; `tsc --noEmit` clean for book-import and capacitor; Biome clean on touched files (two pre-existing non-null-assertion warnings in link-ranges.test.ts left alone).

Review pass (three fresh-context reviewers + disprover, team review workflow) led to these fixes in the import side: (1) `detectLineArt` now takes the sniffed dimensions, skips images over `MAX_LINE_ART_PIXELS` (16 M) and asks `createImageBitmap` for a 64x64 resized bitmap, so a small PNG declaring 20000x20000 can no longer force a ~1.6 GB decode; (2) `ImageStore` enforces per-book budgets `MAX_IMAGES_PER_BOOK = 500` and `MAX_IMAGE_BYTES_PER_BOOK = 64 MB` (the 4 MB cap was per image, and `blob.size` is the inflated size, so a zip of compressible images was unbounded); (3) anchors capped at `MAX_IMAGE_ANCHORS_PER_BOOK = 2000` (one JSON column + one `<figure>` each); (4) root-absolute `src="/OEBPS/img/x.png"` now resolves against the zip root (`resolveArchivePath`) instead of the section folder; (5) a wrapper with loose text followed by an image (`<div>Intro<img/></div><p>Next</p>`) now anchors the image to the following text instead of above the intro; (6) `parseChapters` / `parseLinkRanges` / `parseImageAnchors` share one `parseJsonColumn<T>`; (7) `paragraphIndexForWord` takes `readonly number[]`, removing two casts; fixture literal deduped. Not actioned: the reviewer's "scope creep" finding pointed at another session's uncommitted hunks in shared hook files, not this change. All suites rerun green.

Review round 2 fixes on the import side: images wrapped in an inline element inside a block (`<div class="figcenter"><a><img/></a></div>`, Project Gutenberg's standard illustration markup) were dropped because only `IMG`/`PICTURE`/`FIGURE`/`SVG` children were inspected; now any child that matches no block set contributes its images (test added), `content` unchanged. `hasTextBeforeFirstImage` walks document order to find the first text or image. `imageSource`/`imageRef` folded into `imageRefOf`; `injectTocHeading` no longer generic; `parseChapters`/`parseLinkRanges`/`parseImageAnchors` back to `export function` over a shared `parseJsonColumn`; the vacuous `isLineArt === false` assertion removed from the parser test (the classifier has its own tests).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

EPUB imports now capture body images into a word-anchored sidecar plus a local image table, with `book_content.content` byte-identical to before.

**packages/book-import**
- `dom-paragraphs.ts`: `extractParagraphsWithLinks` also returns `images: ContentImage[]` (`src`, `alt`, `charOffset`). Captures `<img>`, `<picture>`, `<figure>`, SVG `<image>` (`href` / `xlink:href`) as text-less blocks, images inside headings, and images inside `<p>`/`<li>`. An image anchors to the start of the next block with text (or `content.length`); identical src at the same anchor collapses (Kindle twins). Text output unchanged.
- `image-analysis.ts` (new): header-only `sniffImageDimensions` (PNG, JPEG, GIF, WebP, SVG), pure `classifyLineArt(rgba, w, h)`, and `detectLineArt(blob)` via `createImageBitmap` + `OffscreenCanvas` that returns `false` wherever those APIs are missing.
- `epub.ts`: loads each distinct image once from the archive (`key` = resolved archive path), skips unloadable / non-image / > 4 MB files with a warning, carries image-only pages (maps) to the next text section, anchors leftovers at the end, shifts offsets for injected TOC headings, emits `BookPayload.images` + `BookPayload.imageAnchors` (byte offsets).
- `types.ts`: `ImportImage`, `ImportImageAnchor`, new optional `BookPayload` fields.
- Fixture builder accepts body `images`; `imageFixture()` covers every placement.

**apps/capacitor**
- Migration `0035_book_images`: table `book_images (book_id, key, mime, width, height, is_line_art, data)` PK `(book_id, key)`; column `book_content.image_anchors`.
- `queries/books.ts`: `addBookWithContent(..., importImages)` converts anchors with `firstWordAtOrAfter` (not `wordOf`, which floors) and writes one row per image inside the existing rollback guard; `getBookContent` returns `imageAnchors`; `deleteBook` / `hardDeleteBook` remove image rows; new `getBookImages`, `getBookImageData`, `parseImageAnchors`.
- `commit.ts` passes payload images through. Sync untouched: the push selects explicit columns, so neither anchors nor bytes travel.

## Tests
- New: `images.test.ts` (12), `image-analysis.test.ts` (11), `book-images.test.ts` (4, real SQLite).
- Updated: `book-to-sync.test.ts` fixture gains `imageAnchors`.
- Suites: book-import 76 ✓, capacitor 685 ✓, core 142 ✓, web 69 ✓. `tsc` clean. Biome clean on touched files.

## Risks / follow-ups
- `detectLineArt` real-device path unverified (needs a WebView). Check with "Morning Star" when TASK-177.2 renders.
- Figure captions remain dropped (pre-existing) to keep content byte-identical.
- Image rows cross the SQLite bridge in one statement each; the 4 MB cap bounds the worst case.
<!-- SECTION:FINAL_SUMMARY:END -->
