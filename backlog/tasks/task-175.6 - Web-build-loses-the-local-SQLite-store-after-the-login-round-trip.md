---
id: TASK-175.6
title: Web build loses the local SQLite store after the /login round trip
status: Done
assignee:
  - '@claude'
created_date: '2026-09-28 17:25'
updated_date: '2026-09-28 17:58'
labels:
  - capacitor
  - web
  - bug
  - data-loss
dependencies: []
parent_task_id: TASK-175
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the TASK-175.5 e2e spec `e2e-app/sign-in-return.spec.ts` ("signing in from onboarding returns to the /app library, not the website profile").

On the /app web build, a user who signs in from the onboarding sign-in step lands on /app/tabs/library correctly. The next visit to /app/ shows onboarding again, because the jeep-sqlite store (IndexedDB) written before /login is gone. Losing the whole store would also lose books imported only on the web and never synced, so this is potential data loss, not only a lost `onboardingCompleted`.

**Repro:** `E2E_APP_REUSE_BUILD=1 pnpm e2e:app sign-in-return -g onboarding --repeat-each 6`. The first 3 repeats pass and repeats 4–6 fail, consistently.

**Evidence so far:**
- In the failing trace, the page load after /login → /app/tabs/library logs `jeep-sqlite isStore = false` and `getVersion 0`, and every migration is applied again.
- Every jeep open logs `isStore = false` and `getVersion 0` twice.

**Controls that keep the store:**
- skip onboarding, then sign in from the social tab;
- onboarding "Not now";
- onboarding "Sign in", then straight back without logging in;
- import a book, then reload at once.

**Hypotheses to check:**
- two jeep instances;
- per-user or server state on the 4th login (rate limit, session cap, response differences);
- the website clearing the origin's storage (a Clear-Site-Data header, or website code);
- the app wiping state on a new session;
- an unload race between `finish()` and the IndexedDB save.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The web build's jeep-sqlite store keeps a database when the page unloads mid-save (e2e-app/local-store-unload.spec.ts, failing before the fix)
- [x] #2 Signing in from onboarding on the web keeps the local database (sign-in-return spec green on 10 repeats)
- [x] #3 The patch is recorded with why it exists and when to drop it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Root cause (2026-09-28)
jeep-sqlite 2.8.0 persists the web database with a non-atomic replace. `UtilsStore.saveDBToStore` (node_modules/jeep-sqlite/dist/components/jeep-sqlite.js:2702) does:

    await store.removeItem(dbName);   // IndexedDB transaction 1, commits
    await store.setItem(dbName, data); // IndexedDB transaction 2

These are two separate localforage calls, so two separate IndexedDB transactions. With `autoSave = true` (services/db/web-setup.ts), jeep runs this after every write: it exports the whole database and replaces the store entry. If the page unloads after transaction 1 commits and before transaction 2 commits, the entry is gone and the next open starts an empty database. That covers navigation, reload, tab close and the /login redirect. Every migration then runs again and `onboardingCompleted` is back at its default, which is what the TASK-175.5 spec saw.

**Proof (deterministic):** a probe spec using the real /app build:
- It grows the database to about 30 MB (one `randomblob` row via the jeep element), calls the element's `saveToStore`, and sets `location.href` at once.
- Result, 5 of 5 runs: before = 30,142,464 bytes, after = 0.
- An init script logging IndexedDB transactions shows `delete committed`, then `pagehide`, and no `put committed`.
- With a 5 ms or longer delay before navigating, the save completes and the store keeps the database.
- The probe is kept outside the repo at scratchpad/store-unload-probe.spec.ts; it becomes the regression spec.

**Hypotheses ruled out:**
- **Two jeep instances:** `main.tsx` calls `initWebSqlite` once, and `initDb` caches its promise around the single `createConnection`. The first `isStore = false` log comes from the component's `componentDidLoad`, which runs before its async `openStore` resolves, so it is log noise and not a missing store.
- **Per-user or server state on the 4th login:** a later run of the same spec (repeat 6) passed 6 of 6, and an instrumented variant passed 5 of 5. The failure depends on timing and machine load.
- **Website wiping storage:** no Clear-Site-Data header on any auth response (logged in the probe), and nothing in `apps/web/src` calls `indexedDB.deleteDatabase` or `localStorage.clear`.
- **App wiping on a new session:** `adoptSyncIdentity` / `clearAccountScopedState` clear only Preferences keys and social caches, never the database.
- **`finish()` not awaiting the save:** `flush()` does await the write and its `saveToStore`. The loss is jeep's replace being split in two, not a missing await.

**Age:** the web build's `autoSave` and jeep-sqlite 2.8.0 date from b03993f (2026-04-03, "working web"), long before this branch. The redirect change only added a query parameter.

**Blast radius:**
- Every /app web user. The window opens after every database write (reading-position saves, sync merges, highlights, settings, imports) and lasts as long as writing the whole database export to IndexedDB, so it grows with library size; book content lives in SQLite.
- An unload during that window loses the entire local database: books, including web-only imports that were never synced, highlights, glossary, reading sessions not yet pushed, and settings.
- Signed-in users get synced data back on the next pull. Signed-out users, and anything not pushed yet, lose it for good.
- Native Android/iOS are not affected, because they use the native SQLite plugin and no store.

## Proposed fix
- Patch jeep-sqlite through pnpm `patchedDependencies`: `saveDBToStore` drops the `removeItem` and keeps a single `setItem`. localforage's IndexedDB `setItem` is one `put` in one readwrite transaction, so the entry is either the old database or the new one, never missing.
- Check jeep's other store helpers for the same pattern, and patch any that runs on a normal save path.
- No app-code change is needed.

## Test plan
- **Regression spec** `e2e-app/local-store-unload.spec.ts` (the probe as a proper spec): navigating mid-save keeps a database in the store (after > 0). It fails 5 of 5 today.
- **Sign-in round trip:** `sign-in-return` with `--repeat-each 10`, all passing.
- **Full suites:** `pnpm e2e:app` twice, and the existing `pnpm e2e`, which runs the dev web build on the same jeep, once.
- **Checks:** capacitor `pnpm check-types`.
- **Manual:** in the web app, import a book, then reload or close the tab straight after actions that write, and confirm the library stays.

## Fix (2026-09-28)
- **Patch:** `pnpm patch jeep-sqlite@2.8.0` plus `pnpm patch-commit`, which wrote `patches/jeep-sqlite@2.8.0.patch`, `patchedDependencies` in `pnpm-workspace.yaml` (pnpm 10 keeps it there, not in package.json) and the lockfile hash. A YAML comment above it says why the patch exists and when to drop it: once upstream saves with a single put. 2.8.0 is the latest release, so there is nothing to upgrade to.
- **Change:** `UtilsStore.saveDBToStore` loses its `removeItem` and keeps one `setItem`, which is one IndexedDB put in one transaction. It is patched in every copy the package ships: `dist/components/jeep-sqlite.js` (the file the app imports in both the dev and WEB_BUILD bundles, via `services/db/web-setup.ts`), `dist/esm/jeep-sqlite.entry.js`, `dist/cjs/jeep-sqlite.cjs.entry.js`, `dist/collection/utils/utils-store.js` and the minified `dist/jeep-sqlite/p-6e83e397.entry.js`. `removeDBFromStore` is unchanged.
- **Audit of store writes:**
  - `setDBToStore` (autosave and close) and the import paths (`importFromJson`, local disk) all go through `saveDBToStore`, so they are fixed by the same change.
  - `copyDBToStore` and `restoreDBFromStore` are used only by jeep's version-upgrade backup, which the app never triggers because it runs its own migrations and registers no jeep upgrade statements. They inherit the single put.
  - `setInitialDBToStore` is a single `setItem(null)` when a new database is opened.
  - The explicit deletes (`deleteDatabase`, `removeDBFromStore` after an import or restore) are left as they are.
- **Residual risk:** an unload can still abort a put in progress. The store then keeps the previous version and loses only the latest writes, which is acceptable. No `pagehide` flush was added.

## Verification
- **`e2e-app/local-store-unload.spec.ts`:**
  - How it works: it grows the database to about 30 MB, saves, and navigates at once.
  - Unpatched: failed 3 of 3 (30,142,464 bytes, then 0).
  - Patched, fresh build: passed 3 of 3, with the stored size unchanged.
- **`sign-in-return`:** 22 of 22 with `--repeat-each 10` (20 spec runs plus 2 setup).
- **Full suites:**
  - both full `pnpm e2e:app` runs: 11 of 11;
  - existing `pnpm e2e` on the dev build, which uses the same patched jeep: 75 of 75;
  - capacitor `pnpm check-types`: 681 of 681.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixes the web app losing its whole local database when the page unloads while a save is in progress. jeep-sqlite 2.8.0 saved by deleting the IndexedDB entry and then writing it again, in two transactions, and an unload between them left nothing. A pnpm patch makes the save one put, so the store always holds the old or the new database.

- **Scope:** it affected every /app user and any unload, including the /login redirect, where it made onboarding reappear. Local-only data (books imported only on the web and never synced, anything not yet pushed) could be lost for good.
- **Age:** it dates from the first web build (b03993f, 2026-04-03).
- **Guard:** `e2e-app/local-store-unload.spec.ts` failed 3 of 3 before the patch and passes after it. The sign-in spec passes 10 of 10. Both e2e suites and the typecheck are green.
<!-- SECTION:FINAL_SUMMARY:END -->
