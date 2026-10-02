---
id: TASK-176.18
title: Always show page count and reading time in Explore (estimate until counted)
status: Done
assignee: []
created_date: '2026-10-02 10:35'
updated_date: '2026-10-02 16:58'
labels:
  - explore
  - catalog
  - ux
dependencies: []
references:
  - apps/capacitor/src/utils/reading-time.ts
  - apps/capacitor/src/pages/explore/length.ts
  - apps/capacitor/src/pages/explore/catalog-facts.ts
  - apps/capacitor/src/pages/explore/result-card.tsx
  - apps/capacitor/src/pages/explore/catalog-list-item.tsx
  - apps/capacitor/src/pages/explore/web-novel-card.tsx
  - apps/catalog/src/sync/gutenberg-rdf.ts
  - apps/catalog/src/sync/word-count-crawler.ts
parent_task_id: TASK-176
priority: high
ordinal: 125000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: Explore shows length inconsistently. A catalog card shows reading time only once the catalog has an exact word count. In production 1,507 of 1,510 Standard Ebooks books are counted but only 6 of ~75.7k Gutenberg books (the crawler needs ~2.5 more days at 1 book / 3s). Web-novel cards show chapter counts instead. The catalog book page shows words/reading time only for counted books, so most Gutenberg pages show no length at all. The user wants every entry to show a page count plus a reading-time estimate, consistently.

The app already has the page formula: `estimatePages()` in `apps/capacitor/src/utils/reading-time.ts` (250 words per page, device-independent, used by library stats). Reuse it; don't introduce a second words-per-page figure.

Source for an immediate estimate: Gutenberg's RDF catalog (TASK-179) lists every format with its byte size (`dcterms:hasFormat` / `dcterms:extent`), including the plain-text file. Words ≈ plain-text bytes / k gives an estimate for all ~78k books on the next sync. The exact crawler count replaces it as it arrives.

Outcome: every catalog card, list row and book page shows "N pages · reading time" (marked approximate while estimated). Web novels use words where the provider gives them, and chapters only as the last fallback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Catalog stores a word-count estimate per Gutenberg book derived at sync from the RDF's plain-text file size; the bytes-per-word factor is calibrated against books that have exact counts, and the calibration (sample size, median error) is recorded in agents/catalog.md
- [x] #2 API responses expose the effective length (exact count if present, else estimate) and whether it is estimated
- [x] #3 Length filters (min/max words) and length sort use the exact count when present, otherwise the estimate
- [x] #4 One app helper formats length for every surface: pages via the existing estimatePages() plus reading time at the reader's wpm, e.g. "312 pages · 4h 10m", with an approximate marker (e.g. "~") when estimated
- [x] #5 Catalog grid cards, list rows and the book page facts all use that helper; the book page always shows a length fact and says "Length unknown" only when neither count nor estimate exists
- [x] #6 Web-novel cards and previews show pages + reading time when the provider supplies a word count (in listings or details), and chapter count only as a fallback
- [x] #7 Tests cover estimate calibration math, effective-length selection (exact beats estimate), the formatter (exact, estimated, unknown) and the card/detail rendering
- [x] #8 Reading time in Explore uses the reader's measured average speed across all reading sessions (words read / active time, same measurement as library stats' measuredWpm), falling back to AVERAGE_READER_WPM when there is no history; Explore and library book stats no longer disagree for the same reader
- [x] #9 Tapping the length on the book page (and the length line on a card's detail, where tappable) opens a small explainer: the wpm used and where it comes from ("your average over N sessions" vs "a typical speed, adjusts once you've read a bit"), that pages assume 250 words per page, and, when estimated, that the length is approximate until the exact count arrives
- [x] #10 Catalog grid cards show reading time in the cover's top-right badge (e.g. "4h 10m", "~4h") instead of the source badge (SE); the separate length line under title/author is removed. No badge when length is unknown. Pages stay on list rows and the book page.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Parser: plain-text byte size from dcterms:hasFormat (utf-8 first). 2. Calibrate words-per-byte on <=50 Gutenberg books counted from the pglaf mirror at the crawler's rate (only 2 local exact counts); pure calibrate()/estimateWords() in lib. 3. Migration 0007: word_count_estimate + expression index on COALESCE(word_count, word_count_estimate); sync writes it. 4. API: wordCount = effective, wordCountEstimated flag; min/max_words + length sort on COALESCE. 5. App: one formatLength() on estimatePages + reading time, "~" when estimated; grid, list, book page facts ("Length unknown" fallback). 6. Web novels: words from listings/details where present, chapters fallback. 7. Tests + docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Calibration: 50 Gutenberg books stratified by plain-text size, counted from pglaf at crawler pace; 47 counted. English 5.9 bytes/word (n=32, median err 3.5%), other languages 7.0 (n=15, 6.4%). Overall median 4.8%, p90 12.5%, max 14%. A single 6.0 factor had the same median but overstated de/fi up to 32%. Sample committed as src/lib/__tests__/fixtures-length-calibration.json.

Catalog migration 0007_word_count_estimate.sql (column + expression index on COALESCE). Local resync from the archive already downloaded for this task: 78,088 of 78,758 Gutenberg rows got an estimate; 54 visible rows have neither (no text edition).

Web novels: AO3 listings carry dd.words (exact). RR listings give 'N Pages' at RR's 275 words/page, so the listing shows ~words; the RR fiction page tooltip has the exact count ('calculated from 806,306 words'), which the preview uses.

Explore wpm now comes from getMeasuredReadingSpeed (all plausible sessions) via useReadingSpeed; readingPace() is the shared fallback rule also used by book-summary. Length filter buckets use it too (a fresh install: 225 wpm instead of the old 350 RSVP default).

Follow-up 1 (crawler): PENDING_WHERE excludes Gutenberg rows unless they already have a count whose epub_url changed; SE crawled in full. afterRetry() gives a row up after 3 consecutive retry outcomes (marks failed, 7-day retry) and resets the backoff. Gutenberg downloads use the no-images pg{id}.epub (pg84: 78,327 words in both builds; Little Women 0.56 MB vs 16.9 MB).

Follow-up 2 (titles): MARC_SUBFIELD_RULES shared by cleanTitle and cleanTitleSql (nested regexp_replace in the boot pass): marker followed by ':'/';' keeps it, bare marker becomes ': ', trailing marker dropped. DB parity test. Locally fixed gutenberg:34903; rerun is a no-op.

Badges: catalog grid cards show reading time in the cover's top-right corner (CoverLengthBadge, whole hours from 10h, sr-only sentence), no SE badge, no length line. Web-novel grid cards likewise; provider name as muted text under the title only when showProvider (Trending and All-provider grids), off in grouped per-provider sections and provider-filtered views; chapters line only without words. List rows unchanged in layout (catalog length moved to its own line).

Review round: core measuredReadingSpeed reused; bounds wpm rounded to 25 and length-filtered search held until speed settles; explainer copy 'exact once the book has been downloaded'; spoken labels (describeLength.spoken/spokenTime, LengthText); collisionPadding/hideWhenDetached and badge-height fix; mergePreview keeps listing words; settledEstimate (>1% only); live markup verified (RR pages span, RR tooltip, AO3 dd.words); cleanups incl. calibrate() moved to __tests__/calibrate.ts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every Explore surface shows length as "N pages · time" (estimatePages at 250 words/page, reading time at the reader's measured speed, "~" while estimated). Catalog stores a Gutenberg word-count estimate from the RDF plain-text size (two calibrated factors), returns the effective length with wordCountEstimated, and filters/sorts on COALESCE(exact, estimate). The book page always has a length fact (tappable explainer popover) or "Length unknown". Web-novel cards and previews use provider word counts (AO3 listing + details, RR listing pages and exact details) with chapters as fallback. Explore and library stats share readingPace(); Explore reads a new global measured-speed query. Tests: catalog 194/194, app 872/872, Explore E2E 17/17.
<!-- SECTION:FINAL_SUMMARY:END -->
