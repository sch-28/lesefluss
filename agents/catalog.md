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
| `GET /search?q=&page=&limit=` | Search books by title/author across all sources. Paginated. |
| `GET /books/:id` | Single book detail — full metadata + download URL. |
| `GET /covers/:source/*` | Cover proxy for all sources. Strips `Referer`, caches aggressively. Wildcard segment carries the source-specific id (SE ids contain `/`). |
| `GET /health` | Simple health check — returns 200 immediately, does not wait for sync. |

All covers (Gutenberg and SE) are served via the proxy for consistency. Client never hotlinks.

**Book ID routing:** IDs have the form `{source}:{source_id}` and SE ids contain slashes (e.g. `se:mary-shelley/frankenstein`). Use Hono wildcard routes (`/books/*`, `/covers/:source/*`) rather than `:id` params. Clients must `encodeURIComponent` the id when building URLs; server decodes.

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

### Phase 2 — Admin page (`apps/web`)

- [ ] Extend `/admin` with a "Catalog" section
- [ ] Stats tiles: total book count, count per source (Gutenberg / SE), suppressed-dedup count
- [ ] Last sync time per source + sync status (idle / running / failed with last error)
- [ ] Manual "Trigger sync" button (per source + "all")
- [ ] Server route `POST /api/admin/catalog/sync` on `apps/web` — verifies admin session, forwards to catalog with `Authorization: Bearer ${CATALOG_ADMIN_SECRET}`
- [ ] Server route `GET /api/admin/catalog/stats` on `apps/web` — same forwarding pattern for stats
- [x] Catalog side: `GET /admin/stats` endpoint (bearer-auth) backing the above — implemented in Phase 1

### Phase 3 — Explore tab (`apps/capacitor`)

- [ ] New "Explore" tab in tab bar + route (visible on web build too — no native features required)
- [ ] Search bar → `GET /search?q=&lang=` with debounce
- [ ] Language filter control (defaults to `en`)
- [ ] Results list: cover thumbnail (via `/covers` proxy), title, author, source badge (SE = quality signal)
- [ ] Infinite scroll / pagination
- [ ] Book detail screen: full metadata + sanitized HTML description (DOMPurify / rehype-sanitize)
- [ ] **Import** button (when `epub_url` present) → downloads EPUB into existing book import flow
- [ ] "Not available as free EPUB" state when `epub_url` missing
- [ ] Offline handling: gracefully disable search when no network

## Decisions

- **`pg_trgm`**: enabled for both deduplication and user-facing search (typo tolerance)
- **Explore tab on web build**: visible — works via HTTP, no native features required
- **Deduplication threshold**: start at 0.8 similarity, tune during implementation

## Implementation Notes

**Check upstream docs before writing code.** For Hono, Drizzle, node-cron, Gutendex, the SE OPDS feed, and any other external package/API, consult the current official docs (or fetch a live sample response) before implementing against them. Don't rely on training-data recall — APIs, middleware shapes, and feed structures drift. A 2-minute doc check beats a half-day of debugging a stale assumption.
