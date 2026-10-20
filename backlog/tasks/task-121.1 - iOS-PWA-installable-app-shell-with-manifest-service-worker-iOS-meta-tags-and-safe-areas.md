---
id: TASK-121.1
title: >-
  iOS PWA: installable /app/ shell with manifest, service worker, iOS meta tags
  and safe areas
status: To Do
assignee: []
created_date: '2026-10-20 21:58'
updated_date: '2026-10-20 22:05'
labels:
  - pwa
  - ios
  - web
milestone: m-14
dependencies: []
references:
  - apps/capacitor/src/index.html
  - apps/capacitor/vite.config.ts
  - apps/web/vite.config.ts
  - apps/web/Dockerfile
parent_task_id: TASK-121
priority: medium
ordinal: 166000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the `/app/` web build installable from iOS Safari ("Add to Home Screen") so it opens in standalone mode like an app and loads its shell offline.

## How /app/ is served today
The web build is the Capacitor app built with `WEB_BUILD=1`; vite sets `base: "/app/"` (`apps/capacitor/vite.config.ts`). The web Dockerfile copies it into `apps/web/public/app/` (deleting the previous one), Nitro serves it as public files, and `apps/web/src/routes/app/$.ts` answers every other `/app/*` path with index.html and status 200 (SPA fallback). The `/app/**` CSP (`apps/web/vite.config.ts`) has no `worker-src` / `manifest-src`; both fall back to `'self'`, which is enough for a same-origin `/app/sw.js` and manifest. vite-plugin-pwa works with `base: "/app/"`.

## Things that will bite
- **Stale shell after deploy.** Old hashed chunks are deleted on deploy, and the SPA fallback answers a missing `/app/assets/*.js` with index.html (200), so a stale shell that lazy-loads a route chunk gets HTML and a MIME error. Missing `/app/assets/*` must return 404, and the service worker must precache every code-split chunk so an installed app is self-consistent until it updates.
- **Workbox size limit.** Workbox skips files over 2 MiB by default; `index-*.js` (~2.7 MB) and the pdf worker (~2.4 MB) would silently be left out and offline start would fail. Raise `maximumFileSizeToCacheInBytes` and include `wasm` in the precache globs.
- **Updates.** When a new version is available the app updates on next start or shows a reload prompt; a stale shell must never pair with a newer server API indefinitely.
- **Sign-in leaves `/app/`.** Onboarding, social and sync settings send users to `/login` (`onboarding/steps/sync.tsx`, `social/signed-out.tsx`, `routes/tabs/settings/sync.tsx`), which hands off to Google/Discord OAuth. iOS shows out-of-scope pages in an in-app overlay, and session cookie hand-off in standalone mode has been flaky historically. Decide the manifest scope deliberately: likely `scope: "/"` with `start_url: "/app/"` so `/login` stays in the app window, while the service worker stays scoped to `/app/`. Prove the sign-in round trip in standalone.
- **iOS 26 "Open as Web App" is on by default**, so any page added to the Home Screen opens standalone, including the landing page, which uses the website's `/site.webmanifest` (`start_url "/"`, `scope "/"`). Decide whether that manifest should start at `/app/` or the landing page should link to `/app/` prominently; coordinate with the app manifest so the two don't conflict.
- **Icons.** `apps/capacitor/public` has only `apple-touch-icon.png`, `favicon.png`, `logo.png`, `logo.svg`. Add 192/512 and maskable icons; `apple-touch-startup-image` splash images are optional polish.
- **Safe areas.** `index.html` already has `viewport-fit=cover`; in standalone mode the status bar overlaps content unless `env(safe-area-inset-*)` is respected, including the reader's bars and drawers.
- **Theme colour** should follow the app theme (light, dark, sepia, e-ink).
- Must not change the native Android build: manifest, service worker and meta tags are web-build only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An app manifest with start_url /app/, display standalone, name and icons (192, 512, maskable) is served only in the web build; its scope is chosen so the /login round trip stays in the app window, with the decision recorded
- [ ] #2 A service worker scoped to /app/ precaches the app shell, every code-split chunk and the wasm (size limit raised); with the network off an installed app starts and opens already-imported books
- [ ] #3 The service worker never caches /api/* or auth responses and does not control pages outside /app/
- [ ] #4 Missing /app/assets/* files return 404, not the index.html fallback
- [ ] #5 After a deploy, an installed app picks up the new version on next start or via a reload prompt, without chunk-load errors
- [ ] #6 Signing in from the installed app (onboarding, social, settings) returns to the app signed in, verified in standalone mode
- [ ] #7 The website's /site.webmanifest no longer conflicts with the app manifest; decision on its start_url recorded
- [ ] #8 theme-color and apple-mobile-web-app-status-bar-style are set and follow the app theme
- [ ] #9 In standalone mode on a notched iPhone no UI sits under the status bar or home indicator
- [ ] #10 The Android build output is unchanged; pnpm e2e:app checks manifest and service worker are served from /app/ and that a missing asset returns 404
<!-- AC:END -->
