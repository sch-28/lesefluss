---
id: TASK-173
title: >-
  Social API routes: one handler factory for limit, parse, call and error
  mapping
status: Done
assignee:
  - '@claude'
created_date: '2026-09-27 12:34'
updated_date: '2026-09-28 16:17'
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
- [x] #1 Every route under apps/web/src/routes/api/social/ that follows the limit, parse, call, map-error pattern uses the shared factory
- [x] #2 Status codes, response bodies, rate-limit keys and limit values are unchanged for every route
- [x] #3 The factory has unit tests for the 429 path, the invalid-payload path, a SocialError mapping and the success path
- [x] #4 Web test suite and typecheck pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan

### Factory (`apps/web/src/lib/social/http.ts`)
- **`RouteLimit = { key } & RateLimitOptions`.** The rate-limit key is always `${key}:${userId}`, which matches every current key.
- **`socialPost({ limit, schema, run })`:**
  - Applies the limit, parses the JSON body with the Zod schema and returns `invalidPayloadResponse()` on failure.
  - Then runs `run(userId, body)` and maps `SocialError` through `socialErrorResponse`.
- **`socialGetById({ limit, run })`:** the same, except the input is `?id=`, checked with `isUuid`.
- **`socialAction({ limit, run })`:** the limit plus error mapping only, for routes without a body. `run(userId, request)` reads what it needs (query parameters, a binary body).
- **What `run` returns:**
  - a value, which is sent as JSON;
  - a `Response`, which is passed through unchanged (for extra headers, custom 400s, a second limit);
  - `undefined`, which becomes `{ ok: true }`.

### Routes
Moved onto the factory (about 45): every limit–parse–call–map route, including:
- the ones without try/catch today (feed-delete, inbox-read, inbox-read-all, invite-revoke, profile POST, inbox, unread-count, buddy-reads, shares-for-book). Their lib functions throw no `SocialError`, so wrapping them changes nothing;
- the handle and avatar-source routes, which call `getOwnProfile` after the mutation. `getOwnProfile` throws no `SocialError`, so moving it inside the mapped block is safe;
- avatar (binary body, via `socialAction`);
- report (its extra block limit, returned from `run`);
- feed and profile-view (Cache-Control headers, returned as a `Response`).

Left as they are, because they are not the pattern:
- `race.ts`: the limit depends on the parsed action;
- `race-stream.ts`: its 400 has an empty body;
- `handle-check.ts`: an invalid body answers 200 `{available:false}`;
- `relationships.ts`, profile GET and invite GET: no limit;
- `avatar-image` and `cover-image`: public binary routes, one keyed per client.

### Tests
`http.test.ts` covers the 429 path (with Retry-After), the invalid-payload path, the `SocialError` mapping (status and body), success with a value, the `undefined` → `{ok:true}` case, a passed-through `Response`, and a bad `?id=` for `socialGetById`.

### Verification
- Web suite with the database, and the typecheck.
- A diff check that every rate-limit key and limit value is unchanged: list `key`/`max`/`windowMs` before and after.
- A smoke test on the dev server: several endpoints via `api.sh` (a 200, a 400, a 404 `SocialError`).
- No review pass unless you ask.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation (2026-09-28)
- `lib/social/http.ts`:
  - `RouteLimit` and `socialAction`: the per-user limit `${key}:${userId}`, `SocialError` mapping, and the `run` result contract (a `Response` is passed through, `undefined` becomes `{ok:true}`, any other value is sent as JSON).
  - `socialPost`: Zod body, 400 on failure. `socialGetById`: `?id=` checked with `isUuid`, 400 on failure.
- 46 route files moved onto the factory. Routes whose `ok` response came from a void call use `async (...) => { await x; }`, so a lib return value never leaks into the response.
- Special cases kept inside `run`:
  - report: its second block limit returns the 429 `Response`;
  - feed, feed-delete and profile-view: their Cache-Control header;
  - shares-for-book and profile-view: their 400s, now `invalidPayloadResponse()` with the same body;
  - avatar: the binary body through `socialAction`.
- Left as they were, because they are not the pattern: race (the limit depends on the action), race-stream (empty-body 400), handle-check (an invalid body answers 200), relationships, profile GET and invite GET (no limit), avatar-image and cover-image (public, keyed per client).
- Routes that had no try/catch before now map `SocialError`. None of their lib functions throw one (checked), so their responses are unchanged.

## Verification
- Keys and limits: every rate-limit key and `max`/`windowMs` was extracted before and after. The only differences were trailing commas in the old source.
- `http.test.ts` (7 tests): success as JSON, `undefined` → `{ok:true}`, a passed-through `Response`, invalid and non-JSON bodies (400), a bad `?id=` (400), `SocialError` → 404, other errors rethrown, and 429 with Retry-After counted per user.
- Web suite with the database: 210 passed. Typecheck and Biome clean.
- Dev-server smoke test as Phone Two: buddy-reads 200; buddy-read-detail 200, bad id 400, unknown id 404; unread count; feed and profile-view with `private, no-store`; profile-view without `userId` 400; shares-for-book with a bad id 400; block with a bad body 400; inbox-read-all `{ok:true}`.

## Review (4 agents, 2026-09-28)
No behaviour changes and no bugs were found in the factory, its tests or any route.

One correction to the notes above: `avatar-image/$id.ts` is not "keyed per client". It is public and has no rate limit at all; only `cover-image` is limited per client. It is left off the factory because it is a public binary GET with no user. The missing limit was already there before this refactor and is outside its scope.

## Follow-up (2026-09-28)
`avatar-image/$id.ts` now has a per-client rate limit, the same as cover images: `social-avatar-image:${getClientKey(request)}`, 600 per minute, checked before the id. On the dev server, 605 requests gave 600 404s and 5 429s with Retry-After. Typecheck and Biome are clean.

## Correction (2026-09-28): the race routes no longer exist
The notes above list `race.ts` and `race-stream.ts` among the routes left off the factory. TASK-171.15 removed both, and TASK-171.12 was archived. Their successors are `api/social/live.ts`, which uses the factory (`socialPost`), and `api/social/live-stream.ts`, which uses `socialAction` with a UUID check. The `avatar-image/$id` rate limit added under this task is a separate follow-up that the review noted belongs outside a pure refactor. It is recorded here only.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Social API routes now share one handler factory in `apps/web/src/lib/social/http.ts`.

- `socialAction` handles the per-user rate limit (`${key}:${userId}`), `SocialError` mapping, and the `run` result (a `Response` is passed through, `undefined` becomes `{ok:true}`, any other value is sent as JSON).
- `socialPost` adds Zod body parsing with 400 on failure. `socialGetById` adds a `?id=` UUID check.

46 of the route files now state only their limit, schema and lib call. Eight endpoints that do not follow the pattern are unchanged: race, race-stream, handle-check, relationships, profile GET, invite GET, avatar-image and cover-image.

It is a pure refactor:
- Rate-limit keys and values match before and after, checked mechanically.
- Status codes and bodies are unchanged; smoke-tested on the dev server.
- New `http.test.ts` covers 429, invalid payload, a bad id, `SocialError` mapping, rethrow and success.
- Web suite 210/210 with the database; typecheck and Biome are clean.
<!-- SECTION:FINAL_SUMMARY:END -->
