---
id: TASK-173
title: >-
  Social API routes: one handler factory for limit, parse, call and error
  mapping
status: To Do
assignee: []
created_date: '2026-09-27 12:34'
labels:
  - web
  - social
  - refactor
dependencies: []
references:
  - apps/web/src/lib/social/http.ts
  - apps/web/src/routes/api/social/
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The 46 route files under `apps/web/src/routes/api/social/` repeat the same handler skeleton: `rateLimited(key, { max, windowMs })`, parse the body (or a query id) with a Zod schema from `@lesefluss/core`, return `invalidPayloadResponse()` on failure, call one lib function, and map `SocialError` through `socialErrorResponse`. Only the key, the limit, the schema and the lib call differ.

Add a small factory in `apps/web/src/lib/social/http.ts` (for example `socialPost({ limitKey, limit, schema, run })` and a GET variant for `?id=` routes that checks `isUuid`) and move the routes onto it, so the skeleton lives in one place and each route states only what is specific to it. File routes stay one file per endpoint (TanStack Start), with `middleware: [cors, requireAuth]` unchanged.

Found in the TASK-171.9 review. Pure refactor: no change in status codes, response bodies, rate-limit keys or limits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every route under apps/web/src/routes/api/social/ that follows the limit, parse, call, map-error pattern uses the shared factory
- [ ] #2 Status codes, response bodies, rate-limit keys and limit values are unchanged for every route
- [ ] #3 The factory has unit tests for the 429 path, the invalid-payload path, a SocialError mapping and the success path
- [ ] #4 Web test suite and typecheck pass
<!-- AC:END -->
