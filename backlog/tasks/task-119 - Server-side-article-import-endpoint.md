---
id: TASK-119
title: Server-side article import endpoint
status: Done
assignee:
  - '@OpenCode'
created_date: '2026-05-01 13:44'
updated_date: '2026-05-01 15:40'
labels: []
milestone: m-9
dependencies:
  - TASK-118
ordinal: 1800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add an authenticated server endpoint that ingests an article and writes it directly into the canonical sync DB so it lands on all of the user's devices on next sync.

Endpoint: `POST /api/import/article` on `apps/web`.

Accepts either:
- `{ url }` — server fetches via existing catalog `/proxy/article` (SSRF guards, size limits).
- `{ html, url, title? }` — pre-rendered HTML supplied by the caller (used by the browser extension which already has the rendered DOM).

Uses the shared `packages/book-import` HTML parser to produce a `BookPayload`, then writes a book row to the canonical sync schema (mirroring capacitor's commit, minus filesystem). Returns the created book id.

Auth: better-auth bearer token (same scheme the mobile app already uses against `/api/sync` etc.).

Open question to resolve as part of this task: confirm the canonical sync schema in `apps/web/src/db/schema.ts` can hold `source: 'url'` articles today, or add the migration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `POST /api/import/article` accepts `{ url }` and `{ html, url, title? }` payloads
- [x] #2 Authenticated via bearer token; rejects unauthenticated requests
- [x] #3 Uses `packages/book-import` HTML parser server-side via injected linkedom DOM parser
- [x] #4 Writes book to canonical `sync_books` so next client sync replicates it; collisions on `(user_id, book_id)` retry once with a fresh id
- [x] #5 URL path reuses catalog `/proxy/article` for SSRF + size guards
- [x] #6 Per-user rate limit applied
- [x] #7 Endpoint covered by tests (request validation, HTML path, URL path, collision retry, rate limit, invalid URL)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Approved implementation plan:

1. First fix the shared package gap from TASK-118: make the HTML parser accept an injected DOM parser/factory instead of requiring a browser global, and export the shared `generateBookId()` helper from `@lesefluss/book-import` so server and Capacitor use one ID format.
2. Add `@lesefluss/book-import`, `@mozilla/readability`, and a server DOM implementation (`linkedom`) to `apps/web`; update Docker dependency staging if needed so workspace packages install in deployment.
3. Add `POST /api/import/article` in `apps/web`, reusing existing `[cors, requireAuth]` middleware and Better Auth bearer/session handling.
4. Validate payloads with Zod for either `{ url }` or `{ html, url, title? }`, with request/body limits suitable for article import.
5. For `{ url }`, call catalog `/proxy/article` through the shared `fetchUrlToRawInput(url, { catalogUrl: catalogBase() })` path so SSRF guards, upstream timeouts, and size caps stay centralized in catalog.
6. For `{ html, url, title? }`, build a `text/html` RawInput from the provided rendered HTML; parse with `runImportPipeline` using the injected `linkedom` DOM parser; use `title` only as an override/fallback after parsing.
7. Mirror the existing book write semantics in `apps/web/src/routes/api/sync.ts` exactly for `sync_books` instead of inventing a separate persistence model. Confirm whether the canonical schema is a single table or split tables before writing.
8. Store URL imports deliberately as new books every time, matching mobile paste-URL import behavior; no URL deduplication in this task.
9. Persist article rows with `source = "url"`, `sourceUrl = finalUrl`, `fileFormat = "html"` where schema supports it, `position = 0`, `deleted = false`, `content`, cover image, chapters JSON, file size, and word count using shared/import utilities where available.
10. Add a per-user import rate limit via `checkLimit` because the URL path can trigger upstream fetches through our infrastructure.
11. Confirm extension CORS support for `chrome-extension://` / `moz-extension://` origins; if missing and small, add it here, otherwise document as TASK-120 dependency before endpoint use.
12. Return a response shape that follows existing API conventions after checking current web endpoints.
13. Add integration-style tests for unauthenticated rejection, invalid payloads, direct HTML import persistence, URL import through catalog proxy, and rate limiting where practical.
14. Verify with relevant package/web tests and type checks. If catalog proxy code is touched, also run catalog tests; otherwise catalog tests are not required.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented `POST /api/import/article` with existing CORS + `requireAuth` middleware, per-user `article-import:{userId}` rate limit, Zod payload validation for `{ url }` and `{ html, url, title? }`, catalog proxy reuse through `fetchUrlToRawInput`, server-side linkedom DOM parser injection into the shared HTML parser, and direct `sync_books` insert matching the current `/api/sync` single-table persistence shape. Confirmed canonical schema already has `source`/`source_url` and supports `source='url'`, so no migration was needed. Dedup intentionally follows mobile URL import behavior: repeated imports of the same URL create new books. CORS for extension origins already exists in `allowed-origins.ts`: configured extension IDs are required in production; wildcard extension origins are dev-only. Also moved `generateBookId()` into `@lesefluss/book-import` and updated Capacitor to use that shared helper. Verification passed: `pnpm --filter @lesefluss/book-import test`, `pnpm --filter @lesefluss/book-import check-types`, `pnpm --filter @lesefluss/web test`, `pnpm --filter @lesefluss/web check-types`, and `pnpm --filter lesefluss check-types`. Catalog proxy code was not changed, so catalog tests were not run.

Finalization check: endpoint implementation covers both `{ url }` and `{ html, url, title? }` paths, uses existing `requireAuth` bearer/session middleware, parses HTML server-side through `@lesefluss/book-import` with injected linkedom DOM parser, writes directly to `sync_books` with one collision retry for generated IDs, reuses catalog `/proxy/article` via `fetchUrlToRawInput` for URL imports, and applies per-user rate limiting. Tests cover request validation, HTML path, URL path, collision retry, rate limit, invalid URL, and unauthenticated rejection. Final root `pnpm check-types` passed end-to-end after subsequent cleanup.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary
- Added authenticated `POST /api/import/article` on the web app for server-side article ingestion from either `{ url }` or rendered `{ html, url, title? }` payloads.
- Reused the shared `@lesefluss/book-import` pipeline server-side with an injected linkedom DOM parser and shared book ID generation.
- Persisted imported articles directly into canonical `sync_books`, matching sync schema semantics so clients receive them on next sync; generated-ID collisions retry once.
- Reused catalog `/proxy/article` for URL fetches so SSRF/size/upstream guards stay centralized, and added per-user import rate limiting.
- Added endpoint tests for auth, validation, direct HTML import, URL import, collision retry, rate limit, and invalid URL handling.

## Verification
- `pnpm --filter @lesefluss/book-import test` passed.
- `pnpm --filter @lesefluss/book-import check-types` passed.
- `pnpm --filter @lesefluss/web test` passed.
- `pnpm --filter @lesefluss/web check-types` passed.
- `pnpm --filter lesefluss check-types` passed.
- Final root `pnpm check-types` passed end-to-end.
<!-- SECTION:FINAL_SUMMARY:END -->
