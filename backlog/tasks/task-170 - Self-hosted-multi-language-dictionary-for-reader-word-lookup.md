---
id: TASK-170
title: Self-hosted multi-language dictionary for reader word lookup
status: In Progress
assignee: []
created_date: '2026-08-28 20:44'
updated_date: '2026-09-01 20:18'
labels:
  - reader
  - catalog
  - dictionary
dependencies: []
references:
  - 'https://github.com/meetDeveloper/freeDictionaryAPI/issues/249'
  - 'https://kaikki.org/'
documentation:
  - /home/jan/.claude/plans/adaptive-inventing-sparrow.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reader's word-lookup feature is completely broken. `apps/capacitor/src/pages/reader/dictionary-modal.tsx` fetches definitions from `https://api.dictionaryapi.dev`, whose origin server is down behind Cloudflare — every request stalls and then returns HTTP 522. Upstream issue meetDeveloper/freeDictionaryAPI#249 is open and unanswered. All 15 words tested during investigation returned nothing within 5 seconds, on both the phone and web builds.

Replace the third-party API with dictionary data we host ourselves in the catalog Postgres, served from a new catalog endpoint. English and German in the first pass, structured so that adding a further language is configuration rather than code.

Self-hosting is not only about availability. The live Wiktionary REST API was evaluated as a drop-in replacement and rejected: it returns junk-first sense ordering (looking up "ran" yields "ISO 639-3 language code for Riantana" ahead of the verb), dead-end inflection pointers ("plural of wolf" with no actual definition), leaked CSS from `<style>` blocks, and 404s on lowercase proper nouns. Owning the data lets us fix all of those once at import time instead of working around them on every request forever.

Source data is Kaikki.org, which publishes machine-readable wiktextract JSONL dumps of Wiktionary, one edition per language with glosses written in that language. Gzipped dumps are 0.50 GB (English) and 0.30 GB (German).

Lookup performance was benchmarked before committing to this approach: on Postgres 17 with 8M rows and 7.2M distinct words, a single-language hit averages 0.112 ms and a five-language fallback-chain query 0.151 ms, holding at 0.148 ms with cold shared buffers.

Full design, measurements, and rationale: /home/jan/.claude/plans/adaptive-inventing-sparrow.md

Subtasks cover the schema, the importer, the lookup endpoint, Unicode word normalization, the client swap, and populating `books.language`. They are ordered so that everything backend-side ships inert before any user-visible change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tapping a word in an English book returns a definition from our own backend, with no request to any third-party dictionary service
- [x] #2 Tapping a word in a German book returns a German-language definition
- [x] #3 Looking up an inflected form such as "Sprüche" shows the lemma it points to and that lemma's actual definition
- [ ] #4 The dictionary drawer displays Wiktionary CC BY-SA attribution, as required for redistributing the data
- [x] #5 Adding a further language requires only a configuration entry and an import run, no new code
- [x] #6 apps/web CSP no longer allowlists any third-party dictionary origin
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Code complete and verified locally against the real data; **not yet deployed**, so the parent stays In Progress rather than Done.

Seven subtasks, all Done: schema (.1), importer (.2), lookup endpoint (.3), Unicode normalization (.4), client swap (.5), `books.language` population (.6), admin trigger buttons (.7).

## Verified locally

Both dictionaries imported against a live Postgres — English 1,709,579 rows, German 2,645,337 — with idempotent re-imports for each. 21 words checked end to end including every case that previously answered wrongly. Lookup runs as an Index Scan at 0.103 ms with both languages loaded. Repo-wide `pnpm check-types` 8/8, 66 e2e, 39 catalog tests, 655 capacitor, 53 book-import.

Disk: roughly 0.9 GB fresh for both languages, ~1.2 GB after a re-import cycle. Budget ~1.5 GB.

## Outstanding before this can close

1. Deploy `apps/catalog` (migration 0002 applies on boot) and `apps/web` (for the admin buttons).
2. Run the imports from the admin page, English then German, one at a time.
3. Verify on a real device — this is what closes AC #1 and AC #4, and TASK-170.5 AC #10 and TASK-170.7 ACs #1/#2/#4.

## Known gaps, recorded rather than hidden

- **Nothing has been rendered on a device or a production build.** The drawer was rendered in a web dev build with screenshots; the admin panel has never been rendered at all, because an admin session cannot be obtained locally.
- **EPUB `dc:language` extraction has no test.** `book.packaging.metadata` is not populated under vitest, which affects title and author equally — a pre-existing repo limitation, not a regression. See TASK-170.6.
- **The language chip is invisible in the sepia reader theme**, where `bg-muted` resolves to the drawer surface colour. Text stays legible; it is a theme-token collision. See TASK-170.5.
- `DICTIONARY_HANDOFF.md` in the repo root is a temporary working file and should be deleted before committing.
<!-- SECTION:NOTES:END -->
