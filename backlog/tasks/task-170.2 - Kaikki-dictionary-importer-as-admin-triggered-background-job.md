---
id: TASK-170.2
title: Kaikki dictionary importer as admin-triggered background job
status: Done
assignee: []
created_date: '2026-08-28 20:45'
updated_date: '2026-09-01 21:16'
labels:
  - catalog
  - dictionary
  - import
dependencies:
  - TASK-170.1
references:
  - 'https://kaikki.org/'
documentation:
  - /home/jan/.claude/plans/adaptive-inventing-sparrow.md
parent_task_id: TASK-170
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Load Wiktionary-derived dictionary data into the table created by TASK-170.1, one language per run, triggered by an authenticated admin request. Without this the lookup endpoint has no data to serve.

Source is Kaikki.org, which publishes wiktextract JSONL dumps of Wiktionary, one edition per language, with glosses written in that language. Gzipped variants exist for every edition and must be used — 0.50 GB and 0.30 GB rather than 3.21 GB and 3.32 GB uncompressed:

- English: https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz (~1.58M entries)
- German: https://kaikki.org/dewiktionary/Deutsch/kaikki.org-dictionary-Deutsch.jsonl.gz (~788k entries)

The URL pattern is `kaikki.org/{lang}wiktionary/{Endonym}/kaikki.org-dictionary-{Endonym}.jsonl.gz`. Editions whose endonym contains non-ASCII characters (for example `Français`) need the path segment URL-encoded. Put the edition list in its own module so adding a language is a config entry rather than a code change.

Both editions use identical field names per JSONL line: `word`, `pos`, `lang_code`, and `senses[]`, where each sense has `glosses[]` and optionally `tags[]`, `examples[]`, and `form_of[{word}]`. Everything else in the line (`forms`, `sounds`, `etymology_texts`, `translations`, `head_templates`, `categories`) is discarded — that is where the 20x size reduction comes from.

Per entry: drop senses that carry no gloss, drop the entry entirely if none survive, cap the number of senses kept per entry, take the first gloss, take the first example if present, and take `form_of[0].word` if present. Emit one row per surviving sense. Normalize `word_key` and `form_of` with exactly the same NFC-plus-lowercase rule the client uses, or lookups will silently miss. Compute `pos_rank` from a small priority map so junk parts of speech (symbol, letter, character, num, unknown) sort last.

Stream the data: fetch, pipe through gunzip, read line by line. Never buffer the whole file — memory must stay flat, holding only the current insert batch. Parsing is not the bottleneck (Node manages roughly 80,000 lines/second, about 30 seconds of CPU for both languages combined); the run is network- and insert-bound, expect very roughly 10 to 20 minutes per language.

Re-import must replace rather than duplicate, and must not double disk usage or hold millions of rows in one transaction. Record the run start time, stamp `imported_at` on every upserted row, and once the stream completes delete rows for that language older than the run start. If a run is interrupted the sweep never happens, so the previous data stays intact and merely mixes with partial fresh rows until the next successful run reconciles it.

Follow the existing background-job conventions closely. `apps/catalog/src/sync/orchestrator.ts` is the template: a module-level singleton state object, an early-return guard so concurrent triggers are ignored, phase and progress mutators the worker calls, a function that never throws and instead records the error and reports it via `captureException`, and a `finally` block that clears running state. `apps/catalog/src/sync/gutenberg.ts` shows the batched `ON CONFLICT DO UPDATE` upsert (note that `excluded.` references use snake_case column names), the retry-with-backoff shape, tunables as top-of-file constants, and the bracketed log prefix convention.

Trigger goes on the existing admin route in `apps/catalog/src/routes/admin.ts`, which is already gated by `requireAdmin`. Validate the requested language against the edition config with a type-guard predicate, mirroring the existing `isSource` helper, fire the run without awaiting it, and return 202 immediately. Note that catalog CORS permits only GET, POST and OPTIONS, so the trigger must be a POST. Surface importer state through the existing `GET /admin/stats` response so progress is observable.

Any new environment variable must be added to both `apps/catalog/src/env.ts` and `.env.example`. Any new dependency needs a lockfile update, since the Dockerfile installs with `--frozen-lockfile`.

Design reference: /home/jan/.claude/plans/adaptive-inventing-sparrow.md section 2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An authenticated POST to the admin trigger starts an import for a named language and returns 202 immediately without waiting for it to finish
- [x] #2 An unauthenticated request to the trigger is rejected
- [x] #3 Requesting a language that is not in the edition config returns 400 rather than starting a run
- [x] #4 Triggering a second import while one is running is ignored rather than running two concurrently
- [x] #5 The importer streams the gzipped dump without buffering it; process memory stays flat for the whole run rather than growing with file size
- [x] #6 Importing the same language twice in a row leaves the same number of rows as importing it once, with no duplicates
- [x] #7 An import interrupted partway leaves the previously imported data for that language still queryable
- [x] #8 Import progress and last error are visible in the existing admin stats response
- [x] #9 Junk parts of speech such as symbol and letter receive a worse pos_rank than noun, verb, adjective and adverb
- [ ] #10 Word keys written by the importer use the identical normalization rule the client applies, verified by a test asserting both produce the same key for an accented and an umlauted word
- [x] #11 Adding a new language requires only an entry in the edition config
- [x] #12 pnpm check-types passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Streaming Kaikki importer, admin-triggered, in `apps/catalog/src/dict/`.

**Files** — `languages.ts` (edition config), `normalize.ts` (the lookup-key rule), `parse.ts` (pure line parser), `import.ts` (streaming loader + singleton state). Trigger is `POST /admin/dictionary/import` on the existing `requireAdmin`-gated route, returning 202; progress appears under a `dict` key in `GET /admin/stats`.

**Verified against a live Postgres 17 with the real 0.30 GB German dump:**
- Two consecutive full imports both produced exactly 2,645,337 rows, the second replacing all 2,645,337 from the first. No duplicates, no leftover staging tables.
- 83s and 94s per run; 0 malformed lines, 0 wrong-language entries, 50 junk-POS entries dropped.
- Peak RSS 342–353 MB, flat across the run rather than tracking file size.
- Final table size for German alone: **1077 MB**.
- 13 unit tests covering junk-POS dropping, lemma pointers, casing preservation, language filtering, the sense cap, self-referential pointers, malformed JSON, and gloss de-duplication.

**Two design corrections made during implementation, both from measurement:**

1. *The upsert strategy was wrong, not merely buggy.* It required each sense to have a stable unique identity, which the dump does not provide — distinct headwords fold to the same key ("Gift"/"gift") and recur non-adjacently, so batches contained duplicate keys and Postgres rejected them with "ON CONFLICT DO UPDATE command cannot affect row a second time". Replaced with an UNLOGGED staging table plus a single-transaction DELETE + INSERT SELECT swap. This needs no uniqueness at all, so the table lost its primary key (saving ~250 MB of index), and readers keep seeing the previous import until the commit — an interrupted run now leaves the live dictionary untouched rather than half-replaced. Migration 0002 was amended in place since it had not been deployed.

2. *Memory was not flat as originally specified.* Numbering homographs used a map of every distinct headword, which reached 510 MB on German and would be larger on English. Measured that both editions emit a word's entries consecutively (zero scattering across sampled slices), so the map collapsed to two variables.

Also adopted from design review: `ANALYZE` after each swap, since the planner has no statistics for a table that just went from empty to millions of rows and would otherwise sequential-scan every lookup; and a `setImmediate` yield every 20k lines so the synchronous parse loop cannot starve the HTTP server.

**Not verified:** acceptance criterion 10 (importer/client normalization parity) no longer applies as written. Normalization moved entirely server-side — the client now sends the word as it appears in the book and the server owns the key rule on both write and read, so there is one function in one process and no parity to test. `normalize.test.ts` covers the rule itself.

**Update after production-readiness verification.**

English was imported for the first time (the original summary covered German only): **1,709,579 rows from 1,487,639 lines in 104 s**, peak RSS 337 MB, 0 malformed, 0 wrong-language, 424 junk-POS dropped, 6,161 entries sense-capped. Re-importing English produced byte-identical counts and stats with no leftover staging table, so idempotency now holds for both languages.

**The disk figure in the original summary was wrong.** 1077 MB was measured after German had been imported *twice*, so it already included DELETE+INSERT bloat that `VACUUM (ANALYZE)` marks reusable but never returns to the OS. Fresh en+de is ~0.9 GB, ~1.2 GB after one re-import cycle. Budget ~1.5 GB, not the ~2.5 GB previously quoted.

Three changes since:

- `VACUUM (ANALYZE)` replaces the bare `ANALYZE` after each swap. Dead tuples from the whole-language replace would otherwise accumulate across imports.
- A Postgres **advisory lock** now guards the run. The `running` flag is process-local, so two replicas would have collided on the same staging table — the mutual exclusion the code claimed was only true for a single process. Verified by holding the lock from an unrelated session: the second importer logs, bails, downloads nothing, and leaves the first run's reported progress untouched.
- The `/dictionary/languages` count cache is invalidated after each import.
<!-- SECTION:FINAL_SUMMARY:END -->
