---
id: TASK-121
title: PWA support for iOS (web app build) (parent)
status: To Do
assignee: []
created_date: '2026-05-01 14:03'
updated_date: '2026-10-20 22:06'
labels:
  - pwa
  - ios
  - web
milestone: m-14
dependencies:
  - TASK-203
references:
  - TASK-83
  - TASK-203
  - TASK-204
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the Capacitor web build (`/app/`) a usable iOS PWA as a stopgap until a native iOS app ships (TASK-83). Only the app shell under `/app/` plus the website pages that send iPhone users there.

## What an iOS PWA can and cannot do for us
**Works:** library, reader (scroll, page, RSVP), EPUB import through the Files picker, stats, goals, sync, social and the buddy-read live board in the foreground, `navigator.share`. Badging works in installed apps. PWAs still work in the EU (Apple reversed the planned removal in iOS 17.4).

**Works with caveats:**
- Screen wake lock during RSVP: broken in home-screen apps before iOS 18.4.
- iOS 26 opens every Home Screen bookmark as a web app by default, including the landing page, so users can end up installing the wrong start page (TASK-121.1, TASK-121.4).
- Sign-in leaves `/app/` for `/login` and OAuth; standalone handling needs care (TASK-121.1).

**Does not work, and is out of scope here:**
- BLE / rsvpnano device: Safari has no Web Bluetooth.
- Background read-aloud: the native TTS service has no web equivalent; `speechSynthesis` stops when the app is backgrounded.
- Volume keys, folder scan, sharing a file into the app (no Web Share Target on iOS), haptics.
- Goal reminders: no scheduled local notifications on the web.
- Server-sent Web Push (would need a VAPID path on the server): not needed for now.
- Making web-novel scraping work on Cloudflare-protected sites: not needed for now. The web build already fetches through the catalog proxy (`services/serial-scrapers/fetch.ts`) and that stays as is.

## Corrections to the earlier version of this task
- The web build does not use OPFS today. jeep-sqlite/sql.js keeps the whole database in memory and saves it as one IndexedDB value on every write. TASK-203 moves it to SQLite WASM on OPFS and must land before the PWA is promoted to iOS users. TASK-204 (image bytes out of SQLite) is optional and decided by measurements after TASK-203.
- iOS does not cap home-screen web apps at 50 MB (quota is up to ~60% of disk), and home-screen apps are exempt from Safari's 7-day eviction of script-written storage. Their storage is separate from Safari's, though: data from a Safari tab does not carry over when the user installs.
- The export flow already falls back to a browser download on web (`services/export/index.ts`).
- Most native-only features are already hidden on web; TASK-121.2 is an audit, not a build.

## Subtasks
- TASK-121.1 installable shell: manifest and scope, service worker, deploy updates, sign-in in standalone, icons, safe areas
- TASK-121.2 audit native-only features on web, external links in standalone
- TASK-121.3 verify progress survives suspension, sync on resume on web, persistent storage
- TASK-121.4 Add to Home Screen guide in Safari and on the website
- TASK-121.5 real-iPhone test pass and fixes
- TASK-121.6 web telemetry with standalone/iOS tags, in-app note on web limitations
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All subtasks TASK-121.1 to TASK-121.6 are Done
- [ ] #2 TASK-203 is Done before the PWA is promoted to iOS users
- [ ] #3 Known iOS PWA limitations (no device, no background read-aloud, no reminders) are shown in the web build (TASK-121.6) and on the website download page (TASK-121.4)
<!-- AC:END -->
