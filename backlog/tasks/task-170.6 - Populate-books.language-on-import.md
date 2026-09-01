---
id: TASK-170.6
title: Populate books.language on import
status: Done
assignee: []
created_date: '2026-08-28 20:46'
updated_date: '2026-09-01 21:17'
labels:
  - book-import
  - dictionary
  - metadata
dependencies: []
documentation:
  - /home/jan/.claude/plans/adaptive-inventing-sparrow.md
parent_task_id: TASK-170
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`books.language` is documented as a BCP 47 tag but is null for effectively every book in the library, because no import path ever sets it. The dictionary's "try the book's own language first" behaviour therefore never fires and always falls through to the default chain — which is exactly where wrong-language homograph answers come from ("Gift" as a present inside a German novel). Populating the field is what makes that behaviour real.

Three sources are available and all are currently discarded:

The EPUB parser already reads the package metadata block that contains `dc:language`, and the underlying library exposes it, but only title and creator are taken from it. The payload type produced by parsers has no language field to carry it, so one is needed.

Catalog imports already fetch the catalog book's language before downloading, and then drop it: the extras object threaded into the commit step has no slot for it. Catalog values are ISO 639-1 from one source and full region-qualified BCP 47 from another, so both shapes must survive.

The commit step that writes the book row hardcodes the field to the user override or null. It should fall back through the parser's value and the caller-supplied value before null, preserving the existing rule that an explicit user correction from the confirm sheet always wins.

Store whatever the source provided rather than normalizing on write — region-qualified tags are legitimate and the catalog already has a helper that matches a bare language against region-qualified values. Reducing to a primary subtag is the lookup path's job, not the writer's.

Existing books keep their null language and continue to use the fallback chain. No backfill is in scope.

Design reference: /home/jan/.claude/plans/adaptive-inventing-sparrow.md section 6.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Importing an EPUB that declares a language stores that language on the book row
- [ ] #2 Importing an EPUB that declares no language stores null and does not fail
- [x] #3 Importing a book from the catalog stores the language the catalog already reported, in whichever shape the catalog provided it
- [x] #4 A language typed by the user in the confirm sheet still overrides the value detected during import
- [x] #5 Region-qualified tags such as en-GB are stored unchanged rather than being truncated on write
- [x] #6 Existing books are unaffected and keep their current null language
- [x] #7 A book imported with a detected language uses that language first for dictionary lookups
- [ ] #8 Tests cover EPUB language extraction including the absent-language case
- [x] #9 pnpm check-types passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
`books.language` is now populated from the two sources that already had the value and were discarding it.

**EPUB** — `readEpubMetadata` in `packages/book-import/src/parsers/epub.ts` now returns `dc:language` alongside title and creator, threaded through `parseEpub` onto the payload. `BookPayload` gained an optional `language` field.

**Catalog** — `ImportExtras` gained a `language` slot and `services/catalog/import.ts` passes `meta.language`, which it was already fetching and dropping.

**Commit** — `buildImportedBookRow` resolves reader override, then service metadata, then file metadata, then null, capped at `FIELD_LIMITS.language` (35). The cap matters for the same reason as the existing `sourceUrl` cap: the sync server validates the whole push payload in one parse, so a single over-long field 400s the entire snapshot rather than just its own book.

Values are stored verbatim. `en-GB` from Standard Ebooks and `en` from Gutendex both survive; reducing to a primary subtag is the lookup's job, and the edit sheet should show what the source actually declared.

Existing books keep `language: null` and use the fallback chain. No backfill.

**Tests** — 4 added to `commit-row.test.ts` covering the full precedence order, region-tag preservation, the all-absent case, and the length cap. All 650 capacitor tests pass; full-repo `pnpm check-types` passes.

**Acceptance criteria 1, 2 and 8 are not verified, and I could not verify them here.** They require asserting `dc:language` extraction through `epubParser.parse`, and `book.packaging.metadata` is not populated under vitest — I confirmed this is a pre-existing environment limitation rather than a regression by checking `title` and `author`, which fall back to the filename in that environment too, so no EPUB metadata field has parse-level coverage today. I wrote those three tests, watched them fail for that reason, and removed them rather than leave failing or misleading tests behind.

What that leaves: the EPUB read is one line using the same `book.packaging?.metadata` object that already ships title and author to production, so it is exercised by the same code path in the real app but not by the suite. The `EpubFixture` type did gain an optional `language` field (defaulting to "en", `null` to omit the element) so the coverage can be added cheaply if the metadata limitation is ever resolved.

Worth a manual check on a real device: import a German EPUB and confirm the language lands on the book row.

**A second bug in this same path was found and fixed after the task was closed.**

The original change made the import *carry* `dc:language` correctly, but the file-picker path still stored null — so the feature this task exists for was dead on arrival for the main import route.

`apps/capacitor/src/contexts/import-staging-context.tsx` seeded the confirm sheet with `language: null` while seeding title and author from the parse. `buildImportedBookRow` gives the sheet's value precedence outright, so an EPUB declaring `dc:language=de` was committed with null anyway. The earlier precedence fix in this task made it *worse*, not better, by hardening the rule that the sheet wins.

Seeding now mirrors the same precedence the commit step applies when no sheet is shown: `extras.language ?? payload.language ?? null`. The sheet therefore displays the detected language, and what the reader sees is what gets stored. Reviewed independently and confirmed complete — the deliberate-clear behaviour still works, no other seeded field has the same defect, and it also fixes the share-intent path.

**Acceptance criterion 7 is now ticked.** Verified end-to-end: a `dc:language=de` EPUB shows `de` in the confirm sheet, and a lookup from that book produced the English fallback chip — which is the book-language-first chain actually firing.

Criteria 1, 2 and 8 remain unticked for the reason already recorded: `book.packaging.metadata` is not populated under vitest, so no EPUB metadata field — title and author included — has parse-level coverage in this repo. Independently re-checked; `epub.test.ts` still contains no test touching `language`. The code path is the same one that ships title and author to production.
<!-- SECTION:FINAL_SUMMARY:END -->
