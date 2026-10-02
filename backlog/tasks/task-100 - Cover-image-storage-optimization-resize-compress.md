---
id: TASK-100
title: Cover image storage optimization (resize + compress)
status: In Progress
assignee: []
created_date: '2026-04-26 11:29'
updated_date: '2026-10-02 17:19'
labels:
  - performance
  - storage
  - images
milestone: m-13
dependencies: []
documentation:
  - doc-1
  - doc-2
modified_files:
  - packages/book-import/src/utils/cover-image.ts
  - packages/book-import/src/__tests__/cover-image.test.ts
  - packages/book-import/src/parsers/epub.ts
  - packages/book-import/src/parsers/pdf.ts
  - packages/book-import/src/index.ts
  - packages/book-import/package.json
  - apps/capacitor/src/services/book-import/commit.ts
  - apps/capacitor/src/services/serial-scrapers/commit.ts
  - apps/capacitor/src/services/sync/index.ts
  - agents/capacitor.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cover images (book + upcoming series) are stored as base64 data URLs in `books.cover_image` / `series.cover_image` with no resizing or compression. Source images can be 500KB+ each, which bloats SQLite, sync payloads, and memory.

Add a single image-normalization utility that all import paths run covers through before commit:
- Resize to a sensible max (e.g. 400px on the longest edge — covers display small).
- Re-encode to WebP (or JPEG fallback) with tuned quality.
- Target: &lt;30KB per cover.

Apply in `apps/capacitor/src/services/book-import/commit.ts` and the new `commitSeries` path. Also consider a one-time migration to shrink existing oversized covers in user DBs.

Out of scope: glossary avatars (Task-99 covers those separately).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Single shared image-normalization helper used by both book and series imports
- [x] #2 Covers are resized to a documented max dimension and re-encoded with compression
- [x] #3 New imports produce covers under target size budget
- [x] #4 Existing oversized covers are migrated or a follow-up task is filed for the migration
- [ ] #5 No visible quality regression on book/series cards or detail screens
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Helper: packages/book-import/src/utils/cover-image.ts. `normalizeCover(blob)` / `normalizeCoverDataUrl(str)` / `encodeCover(source, size)`. COVER_MAX_SIDE = 600 (grid tile ~120 CSS px x 3 DPR = 360 device px wide, 2:3 -> 400x600), COVER_BUDGET_BYTES = 30 KiB. Encode ladder: q0.8/0.65/0.5 at 600, then q0.6 at 400; smallest attempt kept if none fits. WebP where the encoder really outputs WebP (probe cached; Safari falls back silently to PNG), else JPEG; PNG for a transparent source when WebP is unavailable (JPEG would blacken alpha). Fast path: header-sniffed dims <= 600 and bytes <= budget -> untouched, so the commit-time call is free after the parser already normalized. No createImageBitmap (Node, happy-dom) / decode failure / SVG -> original. OffscreenCanvas preferred, DOM canvas fallback (Safari < 16.4).

Wired: EPUB extractCover (covers probe + parse), PDF renderCover renders page 1 fitted to 600 and encodes via encodeCover (was 200 px JPEG q0.75), commitBook and commitSeries as the last gate. Series covers are remote URLs from providers (Royal Road, ScribbleHub, Wuxiaworld) and pass through. Catalog imports go through the EPUB parser. The edit sheet has no cover picker.

Measured in headless Chromium on the Morning Star EPUB cover (773x1186 JPEG, 97 097 B): WebP 26 332 B at 391x600; JPEG fallback 28 422 B at 391x600. Two heavier images from the same book: 817x1186 146 KB -> WebP 30 446 B 413x600 (JPEG fallback 20 218 B at 276x400); 1190x863 109 KB -> WebP 30 248 B 600x435.

AC#4: follow-up TASK-186 filed instead of a migration. A local shrink cannot reach the server (COALESCE keeps the server cover, content is pushed once per book), web jeep-sqlite rewrites the whole DB per write, and the startup wiring overlaps areas other sessions are editing. Design notes are in TASK-186.

AC#5 not checked: dimensions were chosen for the largest on-screen use, but not visually verified on device. Check library grid (phone + desktop 6-col), detail shell, stats shelf with a fresh EPUB + PDF import.

Review fixes: normalizeCover skips decoding when the header cannot be sniffed or declares > MAX_DECODE_PIXELS (decoding a huge image in a WebView is an OOM kill, and it is reachable from the folder-scan probe). A cover in a stored format (webp/jpeg/png) that is already within COVER_MAX_SIDE now counts as final even above the byte budget, so probe -> parse -> commit never re-encodes it a second time. Trade-off: a heavy JPEG cover that is already <= 600 px is kept as-is. PNG output skips the quality rungs because PNG ignores quality. The WebP probe is only cached when the encoder returned a blob. The PDF cover scale is min(1, 600 / longest side), so pages no longer come out 601-602 px. commitBook normalizes the cover before its commit timer starts. Real-cover measurement unchanged (WebP 26 332 B at 391x600).
<!-- SECTION:NOTES:END -->
