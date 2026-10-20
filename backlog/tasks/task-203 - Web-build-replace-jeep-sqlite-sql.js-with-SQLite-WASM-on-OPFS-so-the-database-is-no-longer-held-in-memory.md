---
id: TASK-203
title: >-
  Web build: replace jeep-sqlite/sql.js with SQLite WASM on OPFS so the database
  is no longer held in memory
status: To Do
assignee: []
created_date: '2026-10-20 21:57'
updated_date: '2026-10-20 22:04'
labels:
  - web
  - pwa
  - storage
  - performance
milestone: m-14
dependencies: []
references:
  - apps/capacitor/src/services/db/web-setup.ts
  - apps/capacitor/src/services/db/index.ts
  - apps/capacitor/vite.config.ts
  - apps/web/vite.config.ts
  - patches/jeep-sqlite@2.8.0.patch
  - TASK-175.6
  - 'https://sqlite.org/wasm/doc/trunk/persistence.md'
priority: high
ordinal: 164000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why
On the web build (`/app/`, and the planned iOS PWA in TASK-121) the local database runs on jeep-sqlite 2.8.0, which wraps sql.js. sql.js has no real filesystem: the whole SQLite database lives in WASM memory (`new SQL.Database(...)` in `node_modules/jeep-sqlite/dist/components/jeep-sqlite.js`). jeep-sqlite persists it by exporting the entire database (`mDb.export()`) and writing it as one value to IndexedDB through localforage, after every write because `autoSave = true` (`apps/capacitor/src/services/db/web-setup.ts`). On startup the whole value is loaded back into memory.

Our database holds the full text, word index and cover of every book (`book_content`) and every EPUB body image as base64 (`book_images`), so it can grow to hundreds of MB. Consequences:
- memory use is the whole database, around twice that during a save; iOS kills web processes that use too much memory;
- every reading-position save rewrites the whole database to IndexedDB, so save cost grows with library size;
- a kill or unload during a save loses the latest writes;
- two open tabs silently overwrite each other's database (last save wins).

Native Android (and a future native iOS app) use `@capacitor-community/sqlite` with a real on-disk file and are not affected.

## Target
The official SQLite WASM build (`@sqlite.org/sqlite-wasm`) with the `opfs-sahpool` VFS, running in a dedicated module Web Worker. It needs no COOP/COEP headers and works on Safari 16.4+ (the plain `opfs` VFS would need Safari 17 and COOP/COEP; do not use it). See https://sqlite.org/wasm/doc/trunk/persistence.md.

- Pin `@sqlite.org/sqlite-wasm` 3.54.x or newer and always install the VFS with `preserveOnInitFailure: true`. Older versions, and the default, call `removeVfs()` when initialisation fails, which deletes all stored data; 3.54 also fixes a same-thread locking bug that can corrupt data. 3.54.1-build1 was published 2026-10-19, so respect the project's two-week package age rule.

## The swap is not confined to Drizzle
Drizzle goes through `sqlite-proxy`, but other code calls the Capacitor SQLite connection API directly. Define a small driver interface (open, close, delete, run, query, execute, begin/commit/rollback) with a native implementation wrapping the plugin and a web implementation talking to the worker. Code that changes:
- `services/db/index.ts`: `checkConnectionsConsistency`, `createConnection`, `closeConnection`, `isDatabase`, `CapacitorSQLite.deleteDatabase` (the last two in `resetAppData`, the recovery UI behind `contexts/database-context.tsx`).
- `services/db/migrations.ts`: `execute`, `query`, `run(..., false)` and the three transaction calls; `migrations.ts` and `adapter.ts` are typed on `SQLiteDBConnection`.
- `main.tsx` (calls `initWebSqlite`), `services/db/web-setup.ts`.
- Build: the sql.js 1.11.0 wasm pinning and serving in `apps/capacitor/vite.config.ts`, `scripts/setup-web.mjs`, `public/assets/sql-wasm.wasm`, `apps/web/Dockerfile`, the jeep patch entry in `pnpm-workspace.yaml` and `patches/jeep-sqlite@2.8.0.patch`, the dependency in `apps/capacitor/package.json`.
- Tests: `e2e/old-webview-notice.spec.ts` asserts a `jeep-sqlite` element exists; `e2e/helpers/storage.ts` and `e2e-app/support/app.ts` reset storage by wiping IndexedDB only and must also clear OPFS; `e2e-app/local-store-unload.spec.ts` drives jeep internals and must be rewritten.

## Build and serving notes
- Vite needs `worker.format: "es"` and, for the dev server used by `pnpm e2e` on :3001, `optimizeDeps.exclude: ["@sqlite.org/sqlite-wasm"]`.
- `sqlite3.wasm` must be served under `/app/assets/` as `application/wasm`.
- CSP for `/app/**` (`apps/web/vite.config.ts`, `appSecurityHeaders`) has no `worker-src`, so it falls back to `script-src 'self'`: a same-origin module worker passes, a `blob:` worker would not. Keep `'wasm-unsafe-eval'`; `'unsafe-eval'` was only for sql.js and should be removed if nothing else needs it.

## Migration for existing web users
The old store can be read without jeep: IndexedDB database `jeepSqliteStore`, object store `databases`, key `leseflussSQLite.db`, value a `Uint8Array` of the SQLite file (see `e2e-app/local-store-unload.spec.ts`). On first start with the new driver, import those bytes into the pool (`importDb`, which accepts a chunk callback) before `runMigrations`. Delete the old entry, and `backup-leseflussSQLite.db` if present, only after the import is confirmed. A failed import keeps the old store, falls back to a clear error state and reports to telemetry. The import briefly holds the old database in memory once; that is acceptable.

## Tabs, reloads and private browsing
The sahpool VFS holds exclusive handles, so a second tab fails to install it, and a reload or full navigation (the `/login` round trip) can race the previous page's worker still holding its handles. Coordinate ownership with a Web Lock (`navigator.locks`) held by the owning tab, retry the install with backoff on reload, and show a clear "Lesefluss is open in another tab" state instead of hanging. In private browsing OPFS may be missing or throw: show a clear error and report it.

## Relationship to other tasks
TASK-175.6 patched jeep to make its save a single IndexedDB put so an unload never left an empty store. SQLite's journal on OPFS must give the same guarantee. TASK-204 (image storage) and TASK-121.3 (persist() call) build on this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The /app web build stores its SQLite database in OPFS via @sqlite.org/sqlite-wasm (3.54+, opfs-sahpool, preserveOnInitFailure: true) in a module worker; jeep-sqlite, sql.js, the jeep patch and the sql.js build plumbing are removed
- [ ] #2 Native and web share one driver interface; native behaviour is unchanged (existing Android e2e and unit tests green)
- [ ] #3 Existing web databases in jeepSqliteStore/databases/leseflussSQLite.db are imported on first start; the old entries are deleted only after a confirmed import; a failed import keeps them and reports to telemetry
- [ ] #4 After the import, memory use does not grow with database size, and position-save time stays flat between a small and a ~200 MB library (both measured and recorded in the task notes)
- [ ] #5 e2e-app/local-store-unload.spec.ts is rewritten: a large write interrupted by navigation leaves a database that passes PRAGMA integrity_check and holds either the old or the new row
- [ ] #6 A second tab shows a clear 'open in another tab' state; a reload or the /login round trip reopens the database without manual action
- [ ] #7 Private browsing without OPFS shows a clear error instead of a blank app
- [ ] #8 No CSP violations on /app; 'unsafe-eval' is removed from the /app CSP unless something else needs it
- [ ] #9 Playwright gets Firefox and WebKit projects running a smoke spec (open, write, reload, read); iOS Safari 16.4+ checked on a real device
- [ ] #10 e2e storage reset helpers clear OPFS; pnpm e2e:app, pnpm e2e and capacitor check-types are green
<!-- AC:END -->
