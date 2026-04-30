---
id: TASK-102
title: 'Sync: investigate failures (initial-fetch errors + 5000-book payload cap)'
status: Done
assignee: []
created_date: '2026-04-26 00:02'
updated_date: '2026-04-29 20:12'
labels: []
milestone: m-4
dependencies:
  - TASK-37
  - TASK-101
references:
  - packages/rsvp-core/src/sync.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/web/src/routes/api/sync.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User-reported sync failures observed in production logs after the TASK-101 deploy. Two distinct failure modes:

## 1. Books array exceeds the 5000 cap

```
debounced push failed: Error: Sync failed (400):
  {"error":"Invalid payload","issues":[
    {"origin":"array","code":"too_big","maximum":5000,
     "inclusive":true,"path":["books"],"message":"Invalid input"}]}
```

Source: `packages/rsvp-core/src/sync.ts` — `SyncPayloadSchema.books: z.array(SyncBookSchema).max(5000)`.

The 5000-row cap predates web-novel support, when `books` meant *imported books*. Since TASK-37 chapter rows are also stored in `books` (with `series_id` set), a user with a handful of large RoyalRoad / Wuxiaworld serials can easily blow past 5000 — RR serials routinely run 1000–2000 chapters each.

This is a **hard block on sync for any heavy serial reader** — every push fails until the chapter count drops, which it never does naturally. Reproduced once, repeats on every debounced push (see log: ~6 retries before the user gave up with Ctrl+C).

### Possible directions (not pre-decided)

- **Raise the cap** — simplest, but the underlying problem (linear growth in chapter count) recurs eventually.
- **Batch the push** — split `books` into chunks of N on the client and send sequential POSTs. Server upsert is already idempotent. Most contained change.
- **Send only changed rows** — track `dirty` flag locally, only push books whose `updatedAt > lastPushedAt`. Largest payoff, biggest refactor.
- **Separate endpoint for chapter rows** — split the wire schema. Cleanest long-term, most disruptive.

Recommendation: start with batched push (option 2) since the server's upsert path already handles it, and it scales without a wire-schema break. Reassess option 3 if push frequency becomes the bottleneck.

## 2. Initial sync — "TypeError: Failed to fetch"

```
[sync] initial sync failed: TypeError: Failed to fetch
```

Generic browser fetch failure — could be CORS, network, sync-server cold start, or the catalog/sync URL being mis-resolved. No structured error from the server side, which means the request never made it (or the response was unparseable). Needs reproduction before we can do more than guess.

Lower priority than #1 since it's transient and the next debounced push retries; #1 is permanent.

## Logs (verbatim, for context)

```
[sync] initial sync failed: TypeError: Failed to fetch
[serial-scrapers] polling TOC for series a7c106c7 (wuxiaworld)
[sync] pushing...
[sync] debounced push failed: Error: Sync failed (400): {"error":"Invalid payload","issues":[{"origin":"array","code":"too_big","maximum":5000,"inclusive":true,"path":["books"],"message":"Invalid input"}]}
[reader] next f044cb5f → 574f31db (chapter 3)
[sync] pushing...
[reader] prev 574f31db → f044cb5f (chapter 2)
[sync] pushing...
[sync] pushing...
[sync] pushing...
[sync] pulling...
[sync] debounced push failed: Error: Sync failed (400): {"error":"Invalid payload","issues":[{"origin":"array","code":"too_big","maximum":5000,"inclusive":true,"path":["books"],"message":"Invalid input"}]}
```

Note: the initial sync failure preceded all the push attempts, so the "pushing..." lines are operating on local state that may already be out-of-sync with server. Worth keeping in mind when designing the fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Reproduce the 5000-book cap failure with a representative user library (e.g. import 2–3 large RoyalRoad serials totaling >5000 chapter rows)
- [ ] #2 Pick and implement one of the four directions for the cap; document the trade-off in the final summary
- [ ] #3 After the fix, a fresh push from a >5000-row library succeeds (no 400 from /api/sync)
- [ ] #4 Reproduce or rule out the 'TypeError: Failed to fetch' on initial sync; if reproducible, identify root cause (CORS / cold start / URL config / network) and address
- [ ] #5 Add a regression test or integration check covering the chosen fix path
<!-- AC:END -->
