---
id: TASK-170.3
title: Dictionary lookup endpoint with language fallback chain
status: Done
assignee: []
created_date: '2026-08-28 20:45'
updated_date: '2026-09-01 21:17'
labels:
  - catalog
  - dictionary
  - api
dependencies:
  - TASK-170.1
documentation:
  - /home/jan/.claude/plans/adaptive-inventing-sparrow.md
parent_task_id: TASK-170
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Serve word lookups from the table created by TASK-170.1. This is what the reader will call instead of the dead third-party API. It can ship before any data is imported — against an empty table every lookup simply reports no entry found, which is safe.

The endpoint takes a word and an ordered list of languages to try, and answers from the first language that has the word. The caller supplies the order: the book's own language first when known, then a fixed fallback chain starting with English, then German. Order matters for correctness, not just preference — English and German share many homographs where the wrong-language answer is silently plausible. "Gift" is poison in German and a present in English; "Rat" is advice; "Kind" is child; "Bad" is bath; "Brief" is letter; "Boot" is boat; "fast" means almost; "bald" means soon.

The language list arriving from the client cannot be trusted to be clean. `books.language` is documented as BCP 47 but is populated by an unvalidated free-text input, so values like "English", "Deutsch", "EN", "en-GB" or outright garbage are all possible. Parse defensively: split, lowercase, reduce each tag to its primary subtag, keep only languages that actually have a dictionary edition, drop duplicates, cap the length, and fall back to a sensible default chain if nothing survives.

Once rows come back, take the language of the best-ranked row as the answering language and keep only that language's rows. A fallback must never interleave two dictionaries in one response.

Inflected words need one extra hop. A large share of entries are pure inflection pointers whose only "definition" is text like "plural of category" or "Nominativ Plural des Substantivs Spruch", with a machine-readable lemma stored alongside. When every row returned for a word is such a pointer, look the lemma up once in the same language and return both, so the reader can show the inflection relationship and then the lemma's real definition. One extra round trip, only for inflected words, never recursive, and guarded against a pointer that references itself.

A word that is not in the dictionary is not an error: return a successful response carrying an explicit "no entry" result rather than a 404. The client's error state should keep meaning "the network or server broke", which is what distinguishes a missing word from a broken deployment.

Responses are cacheable for a long time, since the data only changes when an import runs.

The response type belongs in `packages/core` so the catalog and the app share one definition rather than two drifting copies. It must carry the word queried, which language answered, which chain was actually applied, the entry, any resolved lemma, and the Wiktionary CC BY-SA attribution — attribution travels with the data so that any future consumer inherits the obligation rather than having to remember it.

Follow catalog route conventions: a named exported Hono instance mounted in `apps/catalog/src/index.ts` after the global rate limiter so it inherits that bucket, hand-rolled parameter validation with module-local helpers rather than a validation library (catalog does not use zod), error bodies of the form `{ error: string }`, and returning responses rather than throwing. Put the row-to-response mapper in `apps/catalog/src/lib/` alongside the existing book row mapper.

Include a database-backed integration test. There are no tests in `apps/catalog` today and no test script, so this task adds the runner too. `apps/web/src/lib/sync-book-upsert.integration.test.ts` shows the established pattern: node test environment, skipped unless a database URL is present, unique per-run keys, cleanup afterwards. CI already provisions Postgres for the existing sync tests.

Design reference: /home/jan/.claude/plans/adaptive-inventing-sparrow.md section 3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Looking up a word present in the first requested language returns that language's definition
- [x] #2 Looking up a word absent from the first language but present in the second returns the second language's definition, and the response states which language answered
- [x] #3 A response never mixes senses from two different languages
- [x] #4 Requesting the same homograph with the language order reversed returns different definitions, demonstrating the chain is honoured (for example "Gift" as poison versus present)
- [x] #5 Malformed or unknown language values, including full language names and region-qualified tags, are tolerated without error and fall back to a default chain
- [x] #6 Looking up an inflected form returns both the inflection pointer and the lemma's own definition
- [x] #7 A lemma pointer that references itself does not cause infinite recursion
- [x] #8 A word absent from every requested language returns a successful response with an explicit empty result, not a 404 or 500
- [x] #9 Looking up a word ordered behind a junk part of speech returns the meaningful sense first
- [x] #10 The response includes Wiktionary CC BY-SA attribution
- [x] #11 The response type is defined once in packages/core and used by both the catalog and the app
- [x] #12 The endpoint responds correctly against an empty table, returning empty results rather than erroring
- [x] #13 A database-backed integration test covers chain ordering, lemma resolution and the empty-result case, and is skipped cleanly when no database is configured
- [x] #14 pnpm check-types passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
`GET /dictionary?w=<word>&lang=<book language>` in `apps/catalog/src/routes/dictionary.ts`, plus `GET /dictionary/languages` for the loaded editions and license statement.

**Language chain** — `src/dict/chain.ts` normalizes the caller's language (aliases, region tags, case, junk) and builds `[book language, ...configured fallback]`. Chain policy stays server-side so adding a language remains a config change.

**Query** is the benchmarked shape, confirmed by `EXPLAIN ANALYZE` against the real 2.6M-row German import: Index Scan on `catalog_dict_entry_lookup`, **0.06 ms**, 14 shared buffers. The chain is bound via `sql.param` rather than interpolated — note that a bare array in a drizzle template expands to a record, which both `ANY()` and `array_position()` reject.

Misses return 200 with `entry: null` so the client's error state keeps meaning "network or server broke". Responses are cacheable for a day; a dedicated 240/min rate-limit bucket is mounted *before* the global limiter.

**Two defects found by querying real data, not fixtures:**

1. *One hop was not enough.* German chains inflections: `Bäume → Bäumen → Baum`. A single hop landed on `Bäumen`, itself an inflected form, so the reader got "Dativ Plural des Substantivs Baum" instead of a definition. Now follows up to two hops, bounded and cycle-guarded, keeping the note from the form actually tapped.

2. *Case folding merged distinct German words.* The noun plural `Bäume` and the verb form `bäume` share a folded key, and `Bäume` was resolving to "sich mit einem Ruck aufrichten" — to rear up on its hind legs — instead of trees. Lookups now take the word's original casing and prefer an exact surface match. German capitalises nouns, so this is a precise signal there and inert in English.

Verified against the real German dictionary: `Bäume→Baum`, `bäume→bäumen`, `Sprüche→Spruch`, `Häuser→Haus`, `Kinder→Kind`, `gelaufen→Laufen`, `Gift`→poison (not present), `polenta`→the word that 522'd on the old API throughout, and an unknown word returning a null entry.

**Tests** — `apps/catalog` had no test infrastructure; added vitest, a config, and a `test` script. 26 tests pass, 13 of them a database-backed integration suite covering chain ordering, the winner-language filter, region-tag and free-text language tolerance, lemma resolution, pointer chains, the casing tiebreak, self-reference, junk-POS ordering, misses, 400s, and attribution.

The integration suite skips cleanly with no `DATABASE_URL`. That needed care: `src/env.ts` throws at module load, so a top-level import of `db` failed the whole file instead of skipping it and would have turned CI red. Its imports are now deferred into `beforeAll`. Verified both ways — 13 skipped without a database, 26 passing with one.

**Deferred to TASK-170.5:** acceptance criterion 11. The response types live in `apps/catalog/src/lib/dict-row.ts` and are not yet mirrored in `packages/core`. They cannot be literally shared — the catalog Dockerfile does not vendor `packages/` and the service compiles with plain tsc, no bundler — so the app-side copy lands with the client work, following the same hand-mirrored arrangement the repo already uses for catalog book rows.

**Update after querying real imported data.**

The original verification used German only. With English loaded (1.7M rows) alongside German (2.6M), **four wrong answers surfaced on common words** — none of which the synthetic fixtures could have caught. All four are now fixed, each validated against the real rows and covered by a regression test.

1. `ran` returned a rare nautical noun instead of "simple past of run". This was a regression introduced by the earlier `Bäume` fix: `(form_of IS NOT NULL)` was placed ahead of `pos_rank` to prefer real definitions over pointers, but for an inflected word the pointer *is* the useful sense. That ordering term is removed from the primary lookup.

2. `wolves` never resolved to `wolf`. The hop required every row to be a pointer, and `Wolves` also names a football club and a city — real definitions that blocked it. The hop now fires on the top row alone.

3. `gelaufen` (participle of the verb *laufen*) resolved to the **noun** `Laufen`, the sport; and `bäume` displayed the tree `Baum` under a verb-imperative note. Both came from the hop lookup passing an empty surface, which discarded all discrimination. Hop lookups now rank by what the pointer tells us: a real definition over another pointer, and the same part of speech the inflected form had.

4. `don’t` with a typographic apostrophe missed the exact-match tiebreak. `foldApostrophes` was extracted from `normalizeWord` and applied to the ranking surface. Note this was **not** user-visible — the client folds `’` to `'` before sending — so it is server robustness for any non-app caller.

Verified across 21 words with both languages loaded, including the cases that already worked (`Sprüche`, `Häuser`, `Kinder`, `Gift` in both directions, `polenta`, `café` in NFC and NFD) and cases where a hop must *not* fire (`left`, `saw`, `rose` — all have a real definition as the top row). `EXPLAIN ANALYZE` with both languages loaded: Index Scan on `catalog_dict_entry_lookup`, 0.103 ms.

Also since: a 60-second cache on `/dictionary/languages` (the `GROUP BY` scans millions of rows on a public endpoint), and acceptance criterion 11 is now met — the shared response types landed in `packages/core/src/dictionary.ts` with TASK-170.5.

Three regression tests added for the exact failure shapes: pointer-on-top with other real senses, a hop target holding both a pointer and a real definition, and a verb form pointing at a key shared by a noun and a verb.
<!-- SECTION:FINAL_SUMMARY:END -->
