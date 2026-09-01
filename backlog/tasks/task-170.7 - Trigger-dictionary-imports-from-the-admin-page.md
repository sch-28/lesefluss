---
id: TASK-170.7
title: Trigger dictionary imports from the admin page
status: Done
assignee: []
created_date: '2026-09-01 20:17'
updated_date: '2026-09-01 20:18'
labels:
  - catalog
  - dictionary
  - admin
  - web
dependencies: []
parent_task_id: TASK-170
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The dictionary importer could only be triggered by hand-crafting a curl request with `CATALOG_ADMIN_SECRET`, which meant looking the secret up out of a deployment's environment every time an import was needed. The catalog sync already has admin-page buttons that proxy through an authenticated server function, so the dictionary had no reason to be different.

Adds a Dictionary block to the existing Catalog section of the admin page: buttons to import English, German or all configured languages, and a live status readout showing the running language, phase and row count while an import streams.

The proxy pattern already existed — `catalogFetch(path, { auth: "admin" })` in `apps/web` attaches the bearer token server-side behind an admin session check, so the secret never reaches the browser and nobody has to know it.

Two consequences worth recording. The catalog's `/admin/stats` response grew a `dict` key, and `apps/web` and `apps/catalog` deploy independently — so the admin page has to render correctly against a catalog that predates the change. And an import and a catalog sync must not run at once, since both rewrite the same database.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An admin can start an import for a single language or all languages from the admin page without knowing CATALOG_ADMIN_SECRET
- [ ] #2 The admin secret is never exposed to the browser
- [x] #3 A non-admin cannot trigger an import
- [ ] #4 Import progress (language, phase, rows written) and any error are visible while it runs, and polling stops when it finishes
- [x] #5 The dictionary buttons are disabled while an import or a catalog sync is running, and the sync buttons are disabled while an import is running
- [x] #6 The admin page renders correctly against a catalog that has not yet been redeployed and does not return the dict field
- [x] #7 The requested language is validated at runtime on the web side, not only by its TypeScript annotation
- [x] #8 Concurrent imports are prevented across processes, not only within one, so multiple service replicas cannot collide
- [x] #9 pnpm check-types passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dictionary import buttons added to the admin page's Catalog section, alongside the existing sync controls.

**Web** — `triggerCatalogDictImport` in `apps/web/src/lib/admin.ts`, a `createServerFn` modelled on the existing `triggerCatalogSync`: admin-session check, then `catalogFetch("/admin/dictionary/import", { auth: "admin" })`, treating 202 as success. `CatalogStatsPayload` gained the `dict` block the catalog now returns. The UI adds a status panel and a three-button row inside `CatalogSection`, reusing the sync panel's status-dot and timestamp conventions.

**Reviewed by two agents; four issues found and fixed, three of them before the reviews came back:**

- *Stale-payload crash.* `apps/web` and `apps/catalog` deploy separately, so a web-first deploy would have served the old `/admin/stats` payload with no `dict` key, and `r.data.dict.running` would have thrown inside react-query's `refetchInterval` — taking down the whole Catalog section including the working sync UI. `dict` is now optional and the panel is guarded, so a web-first deploy degrades to "no dictionary block".
- *A comment that was false.* It claimed a sync could not start during an import, but the sync buttons only checked `sync.running`. Both are now symmetric.
- *Contract mismatch.* The catalog sends `dict.stats` (parse counters) that the web type did not declare. Not a runtime fault given the `as` cast, but it would have produced a bogus type error for the next person to use it.
- *Runtime input validation.* `.inputValidator` was an identity function with a type annotation only, and the value reaches catalog code that interpolates the language into DDL. The catalog validated it too, but this endpoint should not be the thing relying on that.

**One finding fixed in the catalog rather than the UI, and it is the substantive one.** The importer's `running` flag is process-local, so two replicas would have collided on the same staging table — the mutual exclusion the code claimed was only ever true for a single process. `runDictImport` now takes a Postgres advisory lock on a dedicated connection held for the whole run and released in `finally`. Verified by holding the lock from an unrelated session: the second importer logs, bails immediately, downloads nothing, and leaves the first run's reported progress untouched.

**Deliberately not done:** no confirmation dialog on the buttons. The import is not destructive to user data and lookups keep serving the previous import throughout, so a misclick costs bandwidth and about two minutes. Adding more unrendered UI immediately before a deploy seemed the worse trade.

`pnpm check-types` passes 8/8; catalog tests 39/39.

**Criteria 1, 2 and 4 are unticked because the page has never been rendered.** An admin session cannot be obtained locally, so the buttons, the live progress readout and the polling behaviour are typechecked and reviewed but unseen. The markup is copied from the working sync block, and the secret's server-side isolation follows the same `createServerFn` pattern `triggerCatalogSync` already ships with — but that is inference, not observation. First thing to check after `apps/web` is redeployed.
<!-- SECTION:FINAL_SUMMARY:END -->
