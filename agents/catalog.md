# Lesefluss Catalog Service

Standalone Hono API service for book discovery. Syncs public domain catalogs (Project Gutenberg, Standard Ebooks) into Postgres and exposes a unified search endpoint. No auth — all endpoints are public.

For project overview see `../AGENTS.md`.

## Tech Stack

- **Hono** — HTTP server
- **Drizzle ORM** + PostgreSQL (same Postgres instance as `apps/web`)
- **node-cron** — periodic catalog sync
- **Deployment**: Docker on VPS via Coolify (separate service, same Postgres)

## Development

```bash
cd apps/catalog
pnpm install
pnpm dev
```

## API Endpoints

| Endpoint | Notes |
|----------|-------|
| `GET /search?q=&genre=&tag=&author=&source=&min_words=&max_words=&sort=&facets=&lang=&page=&limit=` | Search books across all sources. With no filter at all it browses the whole language (sorted by `sort`). Unknown `genre` and `tag` ids are dropped, not rejected, so stale shared links still load; the response echoes the applied `genre` and `tags` so clients can remove dead chips. `tag` repeats or takes a comma list (AND, max 5). `author` matches by author key (see Tags and authors). `source` is `standard_ebooks` (or `se`), `gutenberg`, `any`. `min_words` / `max_words` filter by the exact word count, else the estimate, and leave books with neither out. `sort` is `relevance` (default with `q`), `popular` (default without), `title`, `author`, `recent`, `length` (shortest first by exact count, else estimate; unknown last); invalid is 400. Legacy `order=` is still read as `sort` and echoed back. `facets=tags` adds `facets.tags` (top co-occurring tags, selected excluded) only when `q` (2+ chars), `genre`, `tag` or `author` narrows the set. On zero results with a 2+ char `q`, `suggestion` holds the closest title or author under the same filters (index-backed trigram). Caps: `q` 200 chars, `author` 200, offset 10,000. Errors never echo input. Rows carry `hasEpub`, `wordCount` (exact, else estimate, else null) and `wordCountEstimated`. |
| `GET /tags?lang=&q=&sort=count\|name&limit=` | Tag vocabulary with book counts for a language. `q` filters by label substring. Default limit 50, max 200. Counts cached 10 min per language (bounded cache, invalid `lang` is 400). |
| `GET /genres?lang=` | Every genre id + label + book count for a language. The client's only source of genre labels. Cached 10 min. |
| `GET /languages` | Primary language subtags (`en` covers `en-GB`) with book counts. Cached 10 min. |
| `GET /landing?lang=en` | Aggregated landing payload: `featured_se`, `classics` (hero), `most_read`, `recently_added` (by `added_at`) and three genre shelves that rotate daily (`genresForDay`). Each shelf loads independently; a failed one comes back empty and is named in `failed` so the client can show a per-shelf error. Language-filtered; invalid `lang` is 400. |
| `GET /shelves/random?count=8&lang=en&source=se` | Random books for the "shuffle" shelf. `count` ≤ 20, `source` defaults to SE. No server cache — each call reshuffles. |
| `GET /books/:id{.+}` | Single book detail — full metadata + download URL. Named-wildcard so SE ids with `/` match. |
| `GET /books/similar/:id{.+}` | Up to 12 books sharing the most tags with the given book, same primary language, excluding the book and its author (by author key), then by popularity. Registered before the detail wildcard so `similar/...` is not read as an id. |
| `GET /books/epub/:id{.+}` | EPUB proxy — streams upstream EPUB bytes to the client. Avoids CORS issues hitting Gutenberg/SE directly from the browser and keeps all catalog traffic same-origin. |
| `GET /covers/:source/:rest{.+}` | Cover proxy for all sources. Strips `Referer`, caches aggressively. Wildcard segment carries the source-specific id (SE ids contain `/`). |
| `GET /dictionary?w=&lang=` | Word lookup. `w` is the word with its original casing, unnormalised — the server owns the lookup-key rule. `lang` is the book's own language, passed through unvalidated. An unknown word is **200 with `entry: null`**, never 404, so the client's error state keeps meaning "network or server broke". Own 240/min rate-limit bucket. |
| `GET /dictionary/languages` | Loaded editions, entry counts, and the CC BY-SA statement. Counts cached 60s — the underlying `GROUP BY` scans millions of rows. |
| `GET /health` | Simple health check — returns 200 immediately, does not wait for sync. |

All covers (Gutenberg and SE) are served via the proxy for consistency. Client never hotlinks.

**Book ID routing:** IDs have the form `{source}:{source_id}` and SE ids contain slashes (e.g. `se:mary-shelley/frankenstein`). Use Hono named-wildcard routes (`:id{.+}`, `:rest{.+}`) rather than plain `:id` params. Clients must `encodeURIComponent` the id when building URLs; server decodes.

The EPUB proxy is mounted at `/books/epub/:id{.+}` (not `/books/:id/epub`) because Hono's `RegExpRouter` lets `/:id{.+}` greedily swallow a trailing `/epub` segment when the id itself contains `/` — sending SE epub requests into the detail handler. Separate prefix avoids the collision.

## Database Schema (Postgres)

Shared Postgres instance with `apps/web`. Tables prefixed `catalog_` to avoid collisions.

```
catalog_books
  id            text PK       -- "{source}:{source_id}" e.g. "gutenberg:1342", "se:mary-shelley/frankenstein"
  source        text          -- "gutenberg" | "standard_ebooks"
  title         text
  author        text
  language      text
  subjects      text[]
  summary       text          -- short plain-text summary
  description   text          -- full HTML description (SE only; Gutenberg has generated summaries from the RDF catalog)
  epub_url      text          -- direct EPUB download URL
  cover_url     text          -- upstream cover URL (fetched server-side via /covers proxy, never hotlinked by client)
  gutenberg_id  text          -- set on SE entries when a fuzzy Gutenberg match is found; that Gutenberg entry is suppressed from search
  suppressed    boolean       -- hidden from every listing: Gutenberg entries with a matching SE version, Gutenberg entries without an EPUB (0006, and on insert by the sync), manual takedowns. Code never sets it back to false
  download_count    integer
  tags              text[]        -- normalized tag ids (lib/tags.ts); NULL = not normalized yet
  bookshelves       text[]        -- Gutenberg only
  author_birth_year integer       -- Gutenberg only, first author
  author_death_year integer
  author_keys       text[]        -- one lib/authors.ts key per author
  synced_at     timestamptz
  added_at      timestamptz   -- first insert only; backs sort=recent
  search_vec    tsvector      -- generated column for full-text search (title + author + subjects)
```

```
catalog_tags
  id     text PK   -- tag id, as stored in catalog_books.tags
  label  text      -- canonical display label
```

```
catalog_dict_entry
  lang         text          -- dictionary edition: 'en', 'de'. Glosses are written in this language.
  word_key     text          -- normalizeWord(word) — the lookup key
  word         text          -- original orthography, for display
  entry_index  int           -- orders homographs the dump lists separately. NOT unique.
  pos          text
  pos_rank     int           -- import-time sort weight; junk parts of speech rank last
  sense_index  int
  gloss        text
  example      text
  form_of      text          -- lemma pointer for inflected forms, already in word_key form
```

Index: `(word_key, lang)` for the fallback-chain lookup, `(lang)` for the import swap. Column order on the first one is load-bearing and was benchmarked — 0.151 ms versus 0.198 ms reversed, at identical size, because the chain query filters on the word across several languages at once.

**No primary key, deliberately.** The source dump has no stable per-sense identity: distinct headwords fold to the same `word_key` ("Gift"/"gift") and recur non-adjacently, so any synthetic key collides within a single insert batch. The importer replaces a language wholesale rather than upserting, so uniqueness is never needed and a PK index would cost ~250 MB.

Index: `GIN(search_vec)` for fast full-text search. `pg_trgm` extension for fuzzy/typo-tolerant search if needed later.

**Deduplication:** Standard Ebooks versions supersede their Gutenberg counterparts. During SE sync, each SE entry is fuzzy-matched against existing Gutenberg entries. If a match exceeds the similarity threshold, the SE entry stores the matched `gutenberg_id` and that Gutenberg entry is suppressed from search results. Doesn't need to be 100% — catching most duplicates is sufficient.

## Tags and authors

`catalog_books.tags` holds normalized tag ids from `lib/tags.ts`; `catalog_tags` maps each id to its display label. Raw `subjects` stay untouched for display. The normalizer keeps the head of an LCSH heading (drops ` -- ` subdivisions except form ones like `Juvenile fiction` → `childrens`), strips trailing nationality/era qualifiers and a leading nationality before a form noun (`English poetry` → `poetry`), drops `(Fictitious character)` headings, and merges SE and LCSH spellings through an alias table (`Short stories, English`, `Shorts`, `Short Fiction` → `short-stories`). `tags = '{}'` means "normalized, no tags"; `NULL` means "not normalized yet".

`author_keys` holds one key per author (`lib/authors.ts`): first given name + last surname token, lowercased, diacritics stripped. `Shelley, Mary Wollstonecraft` and `Mary Shelley` both key to `mary shelley`.

Gutenberg sync also persists `bookshelves` and the first author's `author_birth_year` / `author_death_year`. `added_at` is set on first insert only and backs `sort=recent`; rows that predate it were seeded from `synced_at`.

**Backfill:** on boot, after migrations and after the server is listening, a background task cleans stored MARC titles (`cleanTitleSql`, the same rules as `cleanTitle`) and derives tags and author keys for every row with `tags IS NULL` (`sync/backfill.ts`, from stored data, no upstream fetch; ~18.5k rows take a few seconds and never block readiness). A tag-rule change ships as a data migration that clears tags (`0005_retag.sql` did this for the person/place rules), so deploys re-derive automatically. `pnpm db:backfill --retag` stays for manual reruns. Backfilled author keys come from the joined display string, so a few multi-author Gutenberg rows get approximate keys until the next full sync rewrites them from the structured author list. Bookshelves and author years only arrive with the next Gutenberg sync.

## Word counts

`catalog_books.word_count` is the number of words the app will show after import, counted by `lib/word-count.ts`. That file reimplements `@lesefluss/core`'s tokenizer rules, because core ships TS source and this service runs compiled JS; a test pins the two together on mixed sample text. The codepoint fold table is copied from core (`lib/codepoint-fold.ts`) and the test runs both on the same samples, including Latin-1 symbols, ligatures, Latin Extended, fullwidth and control characters. The remaining difference is that the app adds a heading line per chapter on import (a word or two per chapter). Text comes from the OPF spine in reading order, skipping the nav document. `word_count_epub_url` records which EPUB was counted, so a changed `epub_url` is counted again. Null means not counted yet, never zero.

Counts arrive two ways:

- **Proxy:** when `/books/epub/:id` streams a book that has no count for its current EPUB, the upstream body is teed, but only when the upstream sends a content-length of at most 50 MB and no other request is already counting that book. The reader's branch streams untouched; the other is collected and counted in the background (yielding between chapters). The response never waits on it.
- **Crawler** (`sync/word-count-crawler.ts`): off unless `WORD_COUNT_CRAWL=on`, and never under `NODE_ENV=test`, `VITEST` or `CI`. **Scope:** every Standard Ebooks book, but Gutenberg only to recount a book whose EPUB changed since it was counted. Gutenberg is not bulk-crawled: the sync's estimate (see Length estimate) covers its length, and exact counts arrive through the proxy as readers download. Bulk-crawling ~75k books stalled in production on one 17 MB EPUB the mirror couldn't deliver within the timeout. Sequential, one download per `WORD_COUNT_CRAWL_INTERVAL_MS` (floor 3000), User-Agent `lesefluss-catalog/1.0 word-count crawler (+https://lesefluss.app)`. Gutenberg is fetched only from `GUTENBERG_MIRROR` (default `https://gutenberg.pglaf.org`), never www.gutenberg.org, and as the no-images build `cache/epub/{id}/pg{id}.epub` (same words; Little Women is 0.6 MB instead of 17 MB). SE uses the feed URL with patron auth. 429/5xx/network errors (including a body cut off mid-download or a timeout) back off, starting at 20x the interval (1 min at the 3 s default), doubling, 1 h cap; after 3 such retries in a row on the same book it is marked failed and the crawler moves on with the backoff reset, so one book can't stall the queue. Other failures, including an unreadable EPUB, also set `word_count_failed_at`; failed books are retried after 7 days. Downloads are streamed with a 50 MB cap. A Postgres advisory lock keeps it to one crawler per database (a second pod or a rolling deploy stays idle); SIGTERM stops it. All progress lives in the table, so restarts resume. Order: SE first, then most-downloaded Gutenberg.

### Length estimate

Until a Gutenberg book has an exact count (from the EPUB proxy; the crawler no longer bulk-counts Gutenberg), `word_count_estimate` stands in (migration `0007`). The Gutenberg sync derives it from the byte size of the plain-text edition in the RDF catalog (`dcterms:extent` of `ebooks/{id}.txt.utf-8`, else any UTF-8 text, else any text/plain), divided by a bytes-per-word factor (`lib/length-estimate.ts`). APIs return the exact count when present, else the estimate, with `wordCountEstimated`; filters and the length sort use `COALESCE(word_count, word_count_estimate)` (expression index `catalog_books_effective_words`). The book page refetches on open while the length is estimated, so an arriving exact count replaces it. A new estimate replaces the stored one only when it moves by more than 1% (`settledEstimate`), so PG's occasional text-file rebuilds don't rewrite rows every week.

**Calibration** (2026-10-02): 50 Gutenberg books stratified by text size across all ~78k with an EPUB, counted from the pglaf mirror with `lib/word-count.ts` at the crawler's pace; 47 counted (3 mirror retries). Factors are the median bytes per word: **5.9 for English** (32 books, median error 3.5%) and **7.0 for every other language** (15 books, median error 6.4%). With those, the median error over all 47 is 4.8%, p90 12.5%, worst 14%. One shared factor (6.0) had the same median but overstated German and Finnish by up to 32%, which is why English is split out. The sample is `src/lib/__tests__/fixtures-length-calibration.json`; the test recomputes both factors from it with the calibration tool `src/lib/__tests__/calibrate.ts`. ~50 visible Gutenberg books have no text edition and therefore no estimate; they show "Length unknown" until counted.

## Sources

### Wiktionary (via kaikki.org)

Backs the reader's word lookup. Replaced `api.dictionaryapi.dev`, whose origin died (Cloudflare 522 on every request; upstream issue meetDeveloper/freeDictionaryAPI#249).

- **Dumps**: `https://kaikki.org/{lang}wiktionary/{Endonym}/kaikki.org-dictionary-{Endonym}.jsonl.gz`. Paths are **not** uniform — English lives at `/dictionary/English/`, everything else at `/{code}wiktionary/{Endonym}/` — so `src/dict/languages.ts` stores full URLs rather than building them. Always use the gzipped variant: 0.50 GB rather than 3.21 GB for English.
- **Per edition**: glosses are written in that edition's own language. German words get German definitions.
- **Kept per entry**: `word`, `pos`, first gloss per sense (capped at 6 senses), first example, and `form_of[0].word`. Everything else — `forms`, `sounds`, `etymology_texts`, `translations`, `head_templates` — is discarded. That is where the ~20x reduction comes from.
- **Inflections**: 34% of English and 76% of German entries are pure `form_of` pointers. The endpoint follows up to two hops (German chains them: Bäume → Bäumen → Baum), cycle-guarded, keeping the note from the form the reader actually tapped.
- **Measured**: German is 2,645,337 rows and ~1 GB; English is larger. Budget ~2.5 GB for both.
- **Licence**: CC BY-SA. Attribution is rendered in the reader drawer and returned in every lookup response. This is a redistribution obligation, not decoration.

**Import is manual only** — no cron, no boot seed. Each run pulls hundreds of MB from a third party, and Wiktionary dumps move slowly:

```
curl -X POST -H "Authorization: Bearer $CATALOG_ADMIN_SECRET" \
     -H "Content-Type: application/json" -d '{"lang":"en"}' \
     https://catalog.lesefluss.app/admin/dictionary/import
```

Returns 202 immediately; poll `GET /admin/stats` for the `dict` key. Run one language at a time so a failure is isolated. The importer streams into an `UNLOGGED` staging table, then swaps with `DELETE` + `INSERT SELECT` in one transaction — that takes only a `RowExclusiveLock`, so lookups keep serving the previous import throughout and an interrupted run leaves the live data untouched. `VACUUM (ANALYZE)` follows the swap: without the `ANALYZE` the planner would sequential-scan every lookup on a table that just went from empty to millions of rows.

### Project Gutenberg (offline RDF catalog)

- **Source**: `https://www.gutenberg.org/cache/epub/feeds/rdf-files.tar.bz2`, PG's official offline catalog (see gutenberg.org/ebooks/offline_catalogs.html). One `pg{id}.rdf` per ebook, regenerated daily, meant for bulk use. ~127 MB compressed, ~78k text ebooks.
- **Why not Gutendex**: the old sync crawled ~2.5k gutendex.com pages per run. Production started getting `HTTP 403` on page 1 every week (its IP is blocked or challenged; residential IPs still get 200). One archive download per sync avoids the third-party API and the request pattern that got us blocked (TASK-179).
- **Download** (`sync/gutenberg-archive.ts`): one GET with User-Agent `lesefluss-catalog/1.0 weekly catalog sync (+https://lesefluss.app)` (`lib/user-agent.ts`, shared with the word-count crawler), 4 attempts with exponential backoff from 30 s. Written to a fixed path under the OS temp dir, which each run clears first, so a run killed before cleanup doesn't leak 130 MB. A body shorter than `Content-Length` or over 1 GB counts as a failed attempt. Nothing touches the DB until the whole file is on disk, so a failed download leaves every row as it was.
- **Parsing**: `unbzip2-stream` → `tar-stream`, one entry at a time (entries over 5 MB are skipped), then `fast-xml-parser` per RDF (`sync/gutenberg-rdf.ts`, `htmlEntities` on: PG writes CR as `&#13;`). Only the current entry is in memory, never the ~1 GB uncompressed set. A full local run takes ~3 min, peak RSS ~480 MB. Mapping to rows is DB-free (`sync/gutenberg-map.ts`).
- **Fields**: title (`dcterms:title`; a subtitle on its own line becomes `: `, then MARC cleanup), authors with birth/death years (`pgterms:agent`), language (first `dcterms:language`), subjects (LCSH only; LCC call letters like `PR` are dropped), bookshelves, download count, summary (`pgterms:marc520`, PG's generated summary, same text Gutendex served). Subjects and bookshelves are sorted so a reordered file isn't a change. EPUB URL is the first of `.epub3.images` / `.epub.images` / `.epub.noimages` in the file list; cover is `pg{id}.cover.medium.jpg` when listed (served via the `/covers` proxy). The plain-text edition's byte size feeds `word_count_estimate` (see Length estimate).
- **Skipped**: entries whose DCMI type is not `Text` (audio books have no EPUB). `0006_hide_no_epub.sql` suppressed every Gutenberg row without an EPUB (~490 Gutendex-era audio rows plus ~260 texts PG ships only as PDF/LaTeX/plain text), since the app can't open them. New rows without an EPUB arrive suppressed. Known edge: a book that gains an EPUB later stays hidden until unsuppressed by hand.
- **Bad input**: an unreadable entry is counted and skipped, so one broken RDF can't cost the week's run (and with it the SE sync and dedup that follow in `runSync`). The run fails when more than 1% of entries are unreadable or fewer than 50k entries arrived (a truncated or wrong archive); rows written before that are valid and the next run converges. Unreadable entries are reported to Sentry once per run with the count and a few examples.
- **Writes**: batches of 500, compared with the stored row over `SYNCED_COLUMNS` (the same list drives the `ON CONFLICT` update set). Only new or changed rows are upserted, and the log reports `new / changed / unchanged / skipped / unreadable`. Download counts change weekly, so a few thousand rows change every run; that's expected. A record without a summary keeps the stored one (`COALESCE`). The sync only ever sets `suppressed` on insert (true when there's no EPUB) and never updates it, so SE dedup and manual takedowns are never undone.
- **Schedule**: weekly full sync (cron `0 3 * * 0`), same as before.

### Standard Ebooks (via OPDS feed)

- **Feed**: `https://standardebooks.org/feeds/opds/all` — **single request**, `<fh:complete/>`, no pagination, ~1426 books
- **Auth**: HTTP Basic auth required (`SE_EMAIL` + `SE_PASSWORD` env vars) — patron subscription
- **Fields available**: title, author (with Wikipedia/LOC links), language, subjects, short summary, full HTML description, cover URL (full + thumbnail), multiple EPUB formats
- **EPUB URL**: link with `rel="http://opds-spec.org/acquisition/open-access"` and `title="Recommended compatible epub"`
- **Cover URL**: `…/downloads/cover-thumbnail.jpg` — stored in DB, served via `/covers` proxy (same as Gutenberg — covers are always proxied)
- **Description sanitization:** SE `description` is raw HTML. Sanitize on render (DOMPurify / rehype-sanitize) in web and capacitor clients — never trust it verbatim
- **Dedup hint from slug:** SE ids encode author slug (`mary-shelley/frankenstein`). Combine slug-derived author hint with `pg_trgm` similarity for stronger matches than title+author fuzzy alone
- **Sync**: weekly re-fetch of the full feed, upsert by SE identifier
- **Note**: If the SE patron subscription lapses, the sync job logs a warning and skips SE — existing SE entries remain in the DB untouched

## Cover Images

All covers served via `/covers/:source/:id` — consistent for the client, no hotlinking logic needed in the app. Proxy strips the `Referer` header and returns images with `Cache-Control: public, max-age=604800`.

## Rate Limiting

IP-based, in Hono middleware: 60 requests/min per IP. Simple in-memory token bucket (single instance, resets on restart).

## Admin Integration

The `/admin` page on `apps/web` should be extended with a "Catalog" section:
- Last sync time + book count per source
- Manual "Trigger sync" button

**Secret handling:** `CATALOG_ADMIN_SECRET` must never reach the browser. Flow:

1. Browser calls authenticated `POST /api/admin/catalog/sync` on `apps/web`
2. `apps/web` server route verifies admin session, then forwards to catalog service `POST /admin/sync` with `Authorization: Bearer ${CATALOG_ADMIN_SECRET}` header
3. Catalog verifies the bearer and enqueues the sync

## Explore Tab (Capacitor App)

**Current shape (TASK-176).** Everything Explore shows is URL state on `/tabs/explore` (`pages/explore/explore-search.ts`): `q`, `genre`, `tags` (comma list), `lang`, `sort`, `source`, `view`, `scope`. No query and no filters → landing. A plain query → grouped results (catalog shelf + one section per web-novel provider, `See all` per group). Catalog filters or `scope=catalog` → full catalog results with a filter row (sort, genre, language, source, tags, tag facets), infinite scroll and a grid/list toggle. Language default: URL → stored choice → device locale if `/languages` has books in it → `en`. `/tabs/explore/tags` browses tags; catalog detail tags are tappable. The notes below describe the original Phase 3 build.

New tab in the capacitor app calling the catalog search endpoint.

- Search bar → `GET /search?q=&lang=`
- Optional language filter (defaults to `en` — most users want English only; user can broaden)
- Results list: cover thumbnail, title, author, source badge (SE badge = quality signal)
- Book detail screen: full metadata + sanitized description
- If `epub_url` present: **Import** button → downloads EPUB into existing book import flow
- If no `epub_url`: "Not available as free EPUB" message

## Environment Variables

```
DATABASE_URL            # shared Postgres instance
SE_EMAIL                # Standard Ebooks patron account email
SE_PASSWORD             # Standard Ebooks patron account password
CATALOG_ADMIN_SECRET    # shared secret for admin trigger endpoint
PORT                    # default 2999
```

## Deployment

Separate Coolify service pointing at the same Postgres. Dockerfile at `apps/catalog/Dockerfile`.

**Migrations:** committed SQL files applied via `drizzle-kit migrate` on startup (not `push`) — `apps/web` shares this Postgres and schema drift from `push` would be dangerous. Generated-column migrations (tsvector) are authored as raw SQL since drizzle-kit doesn't emit `GENERATED ALWAYS AS (to_tsvector(...)) STORED` natively.

**Startup:** apply migrations → start HTTP server → `/health` returns 200 immediately. Initial Gutenberg seed (a few minutes) runs in the background, not blocking readiness. Coolify health checks must not wait on the seed.

## Open Todo

### Phase 1 — Catalog Server (`apps/catalog`) ✅

- [x] Scaffold `apps/catalog` — Hono + Drizzle + node-cron
- [x] DB schema + committed SQL migration (raw SQL, `pg_trgm` extension, trigger-maintained `tsvector` + GIN index)
- [x] Startup: custom migration runner → serve → background initial seed if table empty
- [x] Gutenberg sync job (originally Gutendex; since TASK-179 the official RDF archive, weekly cron `0 3 * * 0`)
- [x] Standard Ebooks OPDS sync job (single request + XML parse, HTTP Basic auth, graceful skip on missing creds or 401/403)
- [x] SE deduplication (pg_trgm similarity + SE slug author hint, single-query CTE + LATERAL pass, 0.8 threshold)
- [x] `GET /search?q=&lang=&page=&limit=` — tsvector + pg_trgm, BCP-47 language prefix match (`en` covers `en-GB`/`en-US`), pagination
- [x] `GET /books/:id{.+}` — single book detail (named-wildcard route for slash-containing ids)
- [x] `GET /covers/:source/:rest{.+}` — cover proxy, streams upstream body, `Cache-Control: public, max-age=604800` (Node `fetch` doesn't send `Referer`)
- [x] `GET /health` — returns 200 immediately, does not wait on sync
- [x] `POST /admin/sync` — bearer-auth with `timingSafeEqual`, enqueues manual sync, optional `{source}` body
- [x] `GET /admin/stats` — sync state (running / last started / last finished / last error), plus dictionary import state under `dict`
- [x] `POST /admin/dictionary/import` — bearer-auth, `{lang}` validated against the edition config, fire-and-forget, 202
- [x] Rate limiting middleware (60 req/min/IP, in-memory token bucket, `/health` excluded)
- [x] Dockerfile (multi-stage, pnpm workspace filter)
- [x] Update `AGENTS.md` structure section to include `apps/catalog`
- [x] Delete `scripts/check-se-feed.mjs`

**Deviations from original design:**

- `tsvector` is maintained by a `BEFORE INSERT OR UPDATE` trigger, not a generated column — Postgres rejects `array_to_string` in generated columns because it's STABLE, not IMMUTABLE.
- Local port default is `2999` (not `3000`) to avoid conflict with `apps/web` when both run on the same machine. Dockerfile `EXPOSE` matches.
- Migrations applied via a small custom runner (`src/db/migrate.ts`), not `drizzle-kit migrate`. Raw SQL files with trigger definitions don't fit drizzle-kit's journal format cleanly. Idempotent, transactional, tracks applied files in `catalog_schema_migrations`.
- Wildcard routes use Hono's named-regex form (`:id{.+}`). Plain `/*` in Hono doesn't expose the captured segment via `c.req.param("*")`.
- `.env` loaded via Node's native `--env-file-if-exists=.env` (no `dotenv` dependency).

### Phase 2 — Admin page (`apps/web`) ✅

- [x] Extend `/admin` with a "Catalog" section
- [x] Stats tiles: total book count, count per source (Gutenberg / SE), suppressed-dedup count
- [x] Last sync time per source + sync status (idle / running / failed with last error)
- [x] Manual "Trigger sync" button (per source + "all")
- [x] Server fn `triggerCatalogSync` in `apps/web/src/lib/admin.ts` — verifies admin session, forwards to catalog with `Authorization: Bearer ${CATALOG_ADMIN_SECRET}`
- [x] Server fn `getCatalogStats` in `apps/web/src/lib/admin.ts` — same forwarding pattern for stats
- [x] Catalog side: `GET /admin/stats` endpoint (bearer-auth) backing the above — implemented in Phase 1

**Phase 2 deviations:**

- Used TanStack Start `createServerFn` (same pattern as the rest of `lib/admin.ts`) instead of dedicated `/api/admin/catalog/*` route files — they're functionally equivalent and match the existing codebase.
- Enriched catalog orchestrator state with `currentSource`, `phase`, `booksUpserted`, `booksSuppressed` so polling `/admin/stats` returns meaningful progress. `/admin/stats` also returns per-source `counts` (Gutenberg / SE / suppressed / total) so the admin UI has a single request for both tiles and status.
- Client polls every 3s while `running`, every 30s when idle.
- New env on `apps/web`: `CATALOG_URL` (no trailing slash), `CATALOG_ADMIN_SECRET` (server-only).

### Phase 3 — Explore tab (`apps/capacitor`) + book detail routes ✅

- [x] 3rd tab **Library / Explore / Settings** + matching desktop sidebar entry
- [x] Catalog `GET /books/epub/:id{.+}` — streaming proxy, SE Basic auth forwarded, `Content-Type`/`Content-Length` propagated, rate-limited via global middleware
- [x] `books` table: nullable `source` + `catalogId` columns (migration `0007_catalog_source.sql`) + `idx_books_catalog_id` index + mirror on `sync_books` / `SyncBookSchema`
- [x] `VITE_CATALOG_URL` env + `services/catalog/client.ts` wrapper (`searchCatalog`, `getCatalogBook`, `getCoverUrl`, `downloadCatalogEpub` with progress)
- [x] Explore tab (`pages/explore/index.tsx`): debounced search, infinite query, language filter persisted in localStorage, empty/error states
- [x] `/tabs/explore/book/:catalogId` pre-import detail — description sanitized via DOMPurify, swaps Import → "Open in Library" if the book is already local, navigates to `/tabs/library` after import so the new book pops into the grid
- [x] `/tabs/library/book/:id` local detail — progress %, highlights count, On-device badge, Open reader / Set active / Delete actions, lazily enriches from catalog when `catalogId` is set, external-source link to Gutenberg/SE
- [x] Library long-press action sheet: new **Details** entry (keeps Set active + Delete)
- [x] Idempotent import via `queries.getBookByCatalogId`
- [x] `book-import.ts` refactored: `importBookFromBlob(blob, filename, onProgress?, extras?)` shared between file-picker flow and catalog import

**Phase 3 deviations:**

- EPUB proxy folded into `routes/books.ts` (not a separate `routes/epub.ts`), but mounted at `/books/epub/:id{.+}` instead of `/books/:id{.+}/epub`. Hono's `RegExpRouter` let `/:id{.+}` greedily match over `/:id{.+}/epub` whenever ids contained slashes (SE case), sending epub requests to the detail handler. A distinct prefix avoids the ambiguity entirely.
- Detail routes live under `/tabs/...` (inside the tab bar's `IonRouterOutlet`) and hide the tab bar via the same `hideTabBar` class `/tabs/reader/:id` uses, rather than being registered at the root `IonRouterOutlet`. Keeps URL semantics consistent with the rest of the app.
- `source` values on the local `books` table mirror the catalog literal (`gutenberg` | `standard_ebooks`); a null value means locally-imported. Simpler than a 3-value enum.
- CORS: catalog enables `hono/cors` — any origin in dev, `CATALOG_ALLOWED_ORIGINS` (comma-separated) in production. Needed once the browser started calling the service directly.
- Search is prefix-aware: each word becomes `word:*` in a `to_tsquery('simple', …)`, combined with `ILIKE %q%` and pg_trgm similarity. Fixes "fran" not matching "frankenstein".
- EPUB proxy has its own stricter rate-limit bucket (`epubRateLimit`, 10/min/IP, 30 s upstream fetch timeout) on top of the global API limiter — responses are multi-megabyte, the global 60/min bucket would let a single IP saturate bandwidth.
- Sanitized HTML rendering centralised in `components/sanitized-description.tsx` (memoised DOMPurify call). External-source URL builder lives in `services/catalog/client.ts` (`externalSourceUrl`).

### Phase 3b — Explore landing + genre filter + pagination ✅

Current Explore tab is search-only. This phase turns it into a proper browse surface.

**Shape**: hybrid landing — one hero SE shelf, then category shelves, then a genre tile grid. Typing a query or picking a genre chip switches the page into a paginated search-results view.

**Catalog service**

- [x] Add `download_count INTEGER` (nullable) to `catalog_books`. Migration + `idx_catalog_books_download_count` on `(download_count DESC NULLS LAST)`.
- [x] Gutenberg sync: populate `download_count` (now `pgterms:downloads` from the RDF catalog).
- [x] SE sync dedup step: when an SE row matches a Gutenberg row, **copy the matched Gutenberg `download_count` onto the SE row** (denormalise). That way the Most-Read shelf can sort non-suppressed books by a single column while still substituting the SE quality variant wherever one exists.
- [x] Genre map module (`src/lib/genres.ts`): hand-curated list of buckets → array of subject ILIKE patterns. Start with 8: `fiction, science-fiction, mystery, poetry, philosophy, children, history, drama`. Used by both landing and search.
- [x] Classics list module (`src/lib/classics.ts`): hand-picked list of ~30–50 canonical catalog IDs (e.g. `se:mary-shelley/frankenstein`, `gutenberg:1342`). Edited manually; server returns them in list order, filters by requested language.
- [x] `GET /landing?lang=en` — aggregated endpoint:
  ```
  {
    featured_se: [...12 SE, most recent synced_at]
    classics:    [...hand-picked list, language-filtered]
    most_read:   [...12 non-suppressed, ORDER BY download_count DESC NULLS LAST]
    genres: [ { id, label, books: [...8, SE-first then gutenberg fill] } ]
  }
  ```
  Language filter applied to every shelf.
- [x] `GET /shelves/random?count=8&lang=en&source=se` — returns `count` random books (default 8, cap 20). Source filter optional (defaults to SE). Each call reshuffles (no server cache) so the client's "🔀 Shuffle" button just refetches.
- [x] `GET /search` additions:
  - Accept optional `genre` query param → applies the same subject-ILIKE patterns from the genre module.
  - `q` becomes optional when `genre` is provided (validation tweak).
  - Accept optional `order=popular` → sort by `download_count DESC NULLS LAST` instead of relevance.
  - Pagination response already carries `total / page / limit` — keep it; the client will surface Prev / Next controls.

**Capacitor app**

- [x] `services/catalog/client.ts` — add `getLanding(lang)`, `getRandomShelf({ count?, lang?, source? })`, extend `searchCatalog` args with optional `genre` and `order`.
- [x] `services/catalog/query-keys.ts` — add `landing(lang)`, `randomShelf(lang, source, nonce)` (nonce so reshuffle bypasses cache).
- [x] `pages/explore/index.tsx` — orchestrator: debounced query + genre state + language. Mode switch:
  - No query **and** no genre → `<ExploreLanding>`
  - Query or genre set → `<ExploreSearchResults>`
- [x] `pages/explore/landing.tsx` — fetches `/landing`, renders `<Shelf>`s (Featured SE, Classics, Most Read, Random SE, per-genre) plus the genre tile grid at the bottom.
- [x] `pages/explore/shelf.tsx` — horizontal-scroll strip of `ResultCard`s. Supports an optional "See all →" link (genre shelves set it to `/tabs/explore?genre=fiction`) and an optional reshuffle button (Random shelf).
- [x] `pages/explore/genre-chips.tsx` — chip row above the search results when a genre is active / selectable. Tapping a chip narrows; clearing returns to landing.
- [x] `pages/explore/search-results.tsx` — the existing grid but with explicit **Prev / Next** pagination buttons + `Page X of Y` and `total results`. Removes infinite scroll.
- [x] `result-card.tsx` — unchanged (already mirrors `BookCard`).
- [x] Language: already stored in localStorage; landing + search both read from it. Keep respect-language-always behaviour.

**Rollout order**

1. Schema migration + backfill on next Gutenberg sync + SE dedup denormalisation step.
2. Genre map + classics list modules.
3. `/landing`, `/shelves/random`, and `/search` extensions on catalog.
4. Client landing + shelves + random reshuffle button.
5. Replace infinite scroll with Prev / Next pagination.
6. Genre chips.

**Deferred / out of scope**

- Personalised recommendations ("Because you read X").
- Per-user history, seen-tracking, or bookmarking shelves.
- download_count for SE rows without a Gutenberg match stays NULL (bottom-sorted). Acceptable — unmatched SE rows are rare and tend to be new/niche.

## Decisions

- **`pg_trgm`**: enabled for both deduplication and user-facing search (typo tolerance)
- **Explore tab on web build**: visible — works via HTTP, no native features required
- **Deduplication threshold**: start at 0.8 similarity, tune during implementation

## Implementation Notes

**Check upstream docs before writing code.** For Hono, Drizzle, node-cron, the Gutenberg RDF catalog, the SE OPDS feed, and any other external package/API, consult the current official docs (or fetch a live sample response) before implementing against them. Don't rely on training-data recall — APIs, middleware shapes, and feed structures drift. A 2-minute doc check beats a half-day of debugging a stale assumption.
