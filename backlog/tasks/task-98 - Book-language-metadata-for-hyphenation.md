---
id: TASK-98
title: Book language metadata for hyphenation
status: Done
assignee: []
created_date: '2026-04-26 19:51'
updated_date: '2026-10-02 17:24'
labels: []
dependencies: []
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Books currently have no `language` field on the SQLite schema, so PageView's columns container hardcodes `lang="en"` (TODO marker in page-view.tsx). Hyphenation quality on non-English books suffers (English break rules applied to German / French / etc).

Plumbing required:
1. `apps/capacitor/src/services/db/schema.ts` — add `language: text("language")` column to `books` (BCP 47 tag, e.g. "en", "de", "fr"). Migration.
2. `apps/web/src/db/schema.ts` — mirror on syncBooks. Migration.
3. `packages/core/src/sync.ts` — add `language: z.string().nullable().optional()` to `SyncBookSchema`.
4. Import paths to populate it:
   - Catalog imports already get `language` from the catalog API — wire it through (apps/capacitor/src/services/catalog/client.ts already returns it).
   - EPUB import — extract `<dc:language>` from the OPF.
   - Local TXT/HTML imports — leave null (default).
5. PageView consumes `book.language ?? "en"` for the `lang` attribute on the columns container.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Page mode sets the columns' `lang` from `book.language` instead of a hard-coded "en"
- [x] #2 Missing, blank or non-tag language values (e.g. free text "English") fall back to "en"; ISO 639-2 codes ("ger") and underscore tags ("de_AT") are canonicalised
- [x] #3 Unit tests cover the language-to-lang mapping
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Superseded by TASK-164.1 (Book metadata columns + real updatedAt with full sync round-trip), which adds the `language` column to books and sync_books along with the rest of the editable metadata. Hyphenation consuming the column is not covered there and should stay a separate task if still wanted.

Hyphenation now consumes the TASK-164.1 `language` column. New `apps/capacitor/src/pages/reader/hyphenation-lang.ts` (`hyphenationLang()`): trims, maps `_` to `-`, canonicalises via `Intl.getCanonicalLocales`, rejects anything whose primary subtag is not 2-3 letters, and falls back to "en". `PageView` takes a `lang` prop (TODO removed); `reader/index.tsx` passes `hyphenationLang(book.language)`. Scroll mode has no `hyphens: auto`, so it is unchanged (only page-mode chunk-content hyphenates). Tests: `hyphenation-lang.test.ts` (4 cases).

Review fixes: `lang` added to the chunk measure-effect deps (chunk-content.tsx) and to PageView `layoutKey`, so a language change while the book is open re-measures and re-anchors. `hyphenationLang` maps und/mul/mis/zxx (any region/script) to "en"; test added.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Page mode now hyphenates with the book's own language instead of a hardcoded `lang="en"`. `hyphenationLang()` (apps/capacitor/src/pages/reader/hyphenation-lang.ts) canonicalises the free-text `books.language` (e.g. ger→de, de_AT→de-AT) and falls back to "en" for null, free text, malformed tags and und/mul/mis/zxx. `lang` is part of the page-view layoutKey and the chunk measure deps, so a synced language change re-measures the pages. Scroll view has no `hyphens: auto` and is unchanged.

Verified: unit tests, independent review (findings fixed), e2e page-mode-* / reader-modes / appearance specs 18/18.
<!-- SECTION:FINAL_SUMMARY:END -->
