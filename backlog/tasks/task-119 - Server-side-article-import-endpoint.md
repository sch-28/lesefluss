---
id: TASK-119
title: Server-side article import endpoint
status: To Do
assignee: []
created_date: '2026-05-01 13:44'
updated_date: '2026-05-01 13:45'
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
- [ ] #1 `POST /api/import/article` accepts `{ url }` and `{ html, url, title? }` payloads
- [ ] #2 Authenticated via bearer token; rejects unauthenticated requests
- [ ] #3 Uses `packages/book-import` HTML parser server-side (jsdom or linkedom)
- [ ] #4 Writes book to canonical sync DB so next client sync replicates it
- [ ] #5 URL path reuses catalog `/proxy/article` for SSRF + size guards
- [ ] #6 Schema migration added if canonical schema cannot represent URL-source articles
- [ ] #7 Endpoint covered by integration tests
<!-- AC:END -->
