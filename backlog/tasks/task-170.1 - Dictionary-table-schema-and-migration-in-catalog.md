---
id: TASK-170.1
title: Dictionary table schema and migration in catalog
status: Done
assignee: []
created_date: '2026-08-28 20:44'
updated_date: '2026-08-28 20:48'
labels:
  - catalog
  - dictionary
  - database
dependencies: []
documentation:
  - /home/jan/.claude/plans/adaptive-inventing-sparrow.md
parent_task_id: TASK-170
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the Postgres table that stores dictionary entries for all languages, so the importer and lookup endpoint have something to write to and read from. This ships inert — the table is empty until the importer runs, and nothing queries it until the lookup endpoint lands.

The catalog Postgres instance is shared with `apps/web`, which is why every catalog table carries a `catalog_` name prefix.

Migrations here are hand-written idempotent SQL in `apps/catalog/drizzle/NNNN_name.sql`, applied on boot by the custom runner in `apps/catalog/src/db/migrate.ts` (it tracks applied filenames in `catalog_schema_migrations` and runs each file in one transaction). There is no drizzle-kit journal; `drizzle-kit` is only a scaffolding aid. Follow the existing `0000_init.sql` and `0001_download_count.sql` for style — every statement uses `IF NOT EXISTS` or `CREATE OR REPLACE`.

The Drizzle schema in `apps/catalog/src/db/schema.ts` mirrors the SQL by hand; see the existing `catalogBooks` table for the conventions (camelCase TS key with explicit snake_case SQL name, indexes returned as an array from the third table callback, `$inferSelect`/`$inferInsert` type exports at the bottom, and the standing comment that SQL-only objects must be kept in sync manually).

Columns and rationale:

- `lang` — which dictionary edition the row belongs to ("en", "de").
- `word_key` — the lookup key: NFC-normalized and lowercased. The client applies identical normalization, so the two must not drift.
- `word` — original casing, for display.
- `entry_index` — the nth distinct entry for this word in the dump. Wiktionary emits separate entries for homographs with different etymologies, so this is needed to keep the primary key unique.
- `pos` and `pos_rank` — part of speech plus an ordering rank computed at import. `pos_rank` is what stops junk parts of speech sorting first: the English entry for "ran" has a `Symbol` sense ("ISO 639-3 language code for Riantana") ahead of the verb sense, and ranking noun/verb/adj/adv first with symbol/letter/character/num/unknown last fixes that once at import rather than on every request.
- `sense_index` — ordering within an entry.
- `gloss`, `example` — the definition text and an optional example.
- `form_of` — lemma pointer for inflected forms, stored already normalized to `word_key` form. 34% of English and 76% of German entries are pure inflection entries carrying this pointer; it is what lets the endpoint resolve "Sprüche" to "Spruch".
- `imported_at` — stamped on every upsert. The importer sweeps rows older than its run start to make re-import idempotent without a staging table, so this column is load-bearing, not diagnostic.

Primary key is `(lang, word_key, entry_index, sense_index)`.

Two indexes: the lookup index on `(word_key, lang)`, and one on `(lang, imported_at)` for the importer's sweep. Column order on the lookup index matters and was benchmarked — `(word_key, lang)` served the multi-language fallback query at 0.151 ms versus 0.198 ms for `(lang, word_key)`, at identical index size. Do not reverse it.

Expect roughly 1.2 to 1.5 GB on disk once English and German are both loaded, including indexes.

Design reference: /home/jan/.claude/plans/adaptive-inventing-sparrow.md section 1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Migration file exists in apps/catalog/drizzle/ following the existing NNNN_name.sql naming and is fully idempotent (re-running it against an already-migrated database is a no-op)
- [x] #2 Running the catalog service against a fresh database creates the table and both indexes via the boot-time migrate step, with no manual command
- [x] #3 Running the catalog service twice in a row against the same database succeeds, proving idempotency
- [x] #4 The Drizzle schema in apps/catalog/src/db/schema.ts declares the same table with matching column names and indexes, and exports the row types
- [x] #5 The lookup index is on (word_key, lang) in that order
- [x] #6 pnpm check-types passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added `catalog_dict_entry`, the single table holding dictionary senses for every language.

**Migration** — `apps/catalog/drizzle/0002_dictionary.sql`, picked up automatically by the boot-time runner in `src/db/migrate.ts`.

**Schema** — `catalogDictEntry` added to `apps/catalog/src/db/schema.ts` with `DictEntry` / `NewDictEntry` type exports, following the existing `catalogBooks` conventions.

Primary key is `(lang, word_key, entry_index, sense_index)`. `entry_index` is what keeps homographs distinct — Wiktionary lists them as separate entries for the same word in the same language.

Two indexes: `catalog_dict_entry_lookup` on `(word_key, lang)` for the fallback-chain query, and `catalog_dict_entry_lang_imported` on `(lang, imported_at)` for the importer's post-run sweep. The lookup index column order was benchmarked before choosing it: 0.151 ms versus 0.198 ms for the reverse order at identical index size, because the chain query filters on the word across several languages at once.

**Verification** performed against a throwaway Postgres 17 container:
- Boot-time runner applied all three migrations on a fresh database, then reported "up to date" on a second run.
- The raw SQL file was additionally applied twice more directly, to prove the statements themselves are idempotent rather than merely being skipped by name — both runs succeeded with only "already exists, skipping" notices.
- `\d catalog_dict_entry` confirmed all eleven columns, the composite primary key, and both indexes.
- A Drizzle insert/select/delete round-trip confirmed the hand-written schema matches the real table, including that `Sprüche` survives storage intact.
- `pnpm check-types` passes.

The table ships empty and unread: nothing queries it until the lookup endpoint (TASK-170.3) lands, and nothing writes to it until the importer (TASK-170.2) runs.
<!-- SECTION:FINAL_SUMMARY:END -->
