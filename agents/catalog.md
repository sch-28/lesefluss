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
| `GET /search?q=&genre=&order=&lang=&page=&limit=` | Search books by title/author across all sources. `q` optional when `genre` is set. `order=popular` sorts by `download_count` instead of relevance. Paginated. |
| `GET /landing?lang=en` | Aggregated landing payload: `featured_se`, `classics`, `most_read`, and per-genre shelves. Language-filtered. |
| `GET /shelves/random?count=8&lang=en&source=se` | Random books for the "shuffle" shelf. `count` ≤ 20, `source` defaults to SE. No server cache — each call reshuffles. |
| `GET /books/:id{.+}` | Single book detail — full metadata + download URL. Named-wildcard so SE ids with `/` match. |
| `GET /books/epub/:id{.+}` | EPUB proxy — streams upstream EPUB bytes to the client. Avoids CORS issues hitting Gutenberg/SE directly from the browser and keeps all catalog traffic same-origin. |
| `GET /covers/:source/:rest{.+}` | Cover proxy for all sources. Strips `Referer`, caches aggressively. Wildcard segment carries the source-specific id (SE ids contain `/`). |
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
  description   text          -- full HTML description (SE only; Gutenberg has AI-generated summaries via Gutendex)
  epub_url      text          -- direct EPUB download URL
  cover_url     text          -- upstream cover URL (fetched server-side via /covers proxy, never hotlinked by client)
  gutenberg_id  text          -- set on SE entries when a fuzzy Gutenberg match is found; that Gutenberg entry is suppressed from search
  suppressed    boolean       -- true on Gutenberg entries that have a matching SE version
  synced_at     timestamptz
  search_vec    tsvector      -- generated column for full-text search (title + author + subjects)
```

Index: `GIN(search_vec)` for fast full-text search. `pg_trgm` extension for fuzzy/typo-tolerant search if needed later.

**Deduplication:** Standard Ebooks versions supersede their Gutenberg counterparts. During SE sync, each SE entry is fuzzy-matched against existing Gutenberg entries. If a match exceeds the similarity threshold, the SE entry stores the matched `gutenberg_id` and that Gutenberg entry is suppressed from search results. Doesn't need to be 100% — catching most duplicates is sufficient.

## Sources

### Project Gutenberg (via Gutendex)

- **API**: `https://gutendex.com/books/` — paginated at 32/page, ~78k books total (~2450 pages)
- **Fields available**: title, authors (with birth/death years), subjects, bookshelves, languages, summaries (AI-generated), download URLs per MIME type, download count
- **EPUB URL**: extracted from `formats["application/epub+zip"]`
- **Cover URL**: extracted from `formats["image/jpeg"]` — but Gutenberg blocks hotlinking by referrer, so served via `/covers/gutenberg/:id` proxy
- **Initial seed**: fetch all pages with concurrency (e.g. 10 parallel requests) — completes in a few minutes
- **Incremental sync**: weekly re-fetch, upsert by book ID

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

**Startup:** apply migrations → start HTTP server → `/health` returns 200 immediately. Initial Gutendex seed (minutes) runs in the background, not blocking readiness. Coolify health checks must not wait on the seed.

## Open Todo

### Phase 1 — Catalog Server (`apps/catalog`) ✅

- [x] Scaffold `apps/catalog` — Hono + Drizzle + node-cron
- [x] DB schema + committed SQL migration (raw SQL, `pg_trgm` extension, trigger-maintained `tsvector` + GIN index)
- [x] Startup: custom migration runner → serve → background initial seed if table empty
- [x] Gutendex sync job (paginated, 3-way concurrency, 500 ms pacing, exponential-backoff retry, weekly cron `0 3 * * 0`)
- [x] Standard Ebooks OPDS sync job (single request + XML parse, HTTP Basic auth, graceful skip on missing creds or 401/403)
- [x] SE deduplication (pg_trgm similarity + SE slug author hint, single-query CTE + LATERAL pass, 0.8 threshold)
- [x] `GET /search?q=&lang=&page=&limit=` — tsvector + pg_trgm, BCP-47 language prefix match (`en` covers `en-GB`/`en-US`), pagination
- [x] `GET /books/:id{.+}` — single book detail (named-wildcard route for slash-containing ids)
- [x] `GET /covers/:source/:rest{.+}` — cover proxy, streams upstream body, `Cache-Control: public, max-age=604800` (Node `fetch` doesn't send `Referer`)
- [x] `GET /health` — returns 200 immediately, does not wait on sync
- [x] `POST /admin/sync` — bearer-auth with `timingSafeEqual`, enqueues manual sync, optional `{source}` body
- [x] `GET /admin/stats` — sync state (running / last started / last finished / last error)
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
- [x] Gutenberg sync: populate `download_count` from Gutendex `download_count`.
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

**Check upstream docs before writing code.** For Hono, Drizzle, node-cron, Gutendex, the SE OPDS feed, and any other external package/API, consult the current official docs (or fetch a live sample response) before implementing against them. Don't rely on training-data recall — APIs, middleware shapes, and feed structures drift. A 2-minute doc check beats a half-day of debugging a stale assumption.
