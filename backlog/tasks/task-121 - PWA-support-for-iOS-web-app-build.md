---
id: TASK-121
title: PWA support for iOS (web app build)
status: To Do
assignee: []
created_date: '2026-05-01 14:03'
labels:
  - pwa
  - ios
  - web
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the Capacitor web build (`/app/`) installable as a PWA on iOS Safari. The landing page is out of scope — only the app shell served under `/app/`.

## Context

The web build already has partial groundwork (`apple-touch-icon`, `viewport-fit=cover`, jeep-sqlite for WASM-based SQLite via OPFS). What's missing is the manifest, service worker, a couple of meta tags, and a web-compatible export fallback.

BLE connectivity is a known non-goal on web/iOS.

## What's needed

### 1. Web App Manifest
Add `manifest.json` with `display: standalone`, `start_url: /app/`, `scope: /app/`, and correct icon paths. The vite config already sets `base: '/app/'` for web builds.

### 2. Service Worker (via `vite-plugin-pwa`)
Without a SW, Safari treats "Add to Home Screen" as a plain bookmark, not a PWA. Use `vite-plugin-pwa` + Workbox for generation and caching strategy.

### 3. Missing meta tags in `src/index.html`
- `theme-color`
- `apple-mobile-web-app-status-bar-style` (controls status bar in standalone mode)
- Splash screens (`apple-touch-startup-image`) — tedious (one per device resolution) but good polish

### 4. Fix export on web (`services/export/index.ts`)
`Filesystem.writeFile` + `Filesystem.getUri` has no platform guard and breaks on web. Replace with a `URL.createObjectURL` + anchor-click download when not on native.

### 5. Test on a real iOS device
Verify OPFS/SQLite works, installability, and standalone mode behaviour.

## Risk: OPFS storage eviction
iOS aggressively evicts OPFS (and IndexedDB) data from PWAs that aren't used regularly (~50MB limit). Users could lose their local DB after weeks of inactivity. No hard fix without server-side sync as a safety net — worth documenting as a known limitation for now.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 manifest.json present with correct start_url, scope, display, and icons for the /app/ build
- [ ] #2 Service worker registered via vite-plugin-pwa; app shell cached for offline load
- [ ] #3 index.html includes theme-color and apple-mobile-web-app-status-bar-style meta tags
- [ ] #4 Export flow works on web (browser download) without crashing
- [ ] #5 App can be added to iOS Home Screen and launches in standalone mode
- [ ] #6 SQLite (jeep-sqlite/OPFS) initialises and persists data correctly on iOS Safari 17+
<!-- AC:END -->
