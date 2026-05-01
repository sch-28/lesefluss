---
id: TASK-86
title: Browser extension
status: To Do
assignee: []
created_date: '2026-04-26 15:59'
updated_date: '2026-05-01 13:45'
labels: []
milestone: m-9
dependencies:
  - TASK-119
  - TASK-120
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cross-browser (Firefox + Chromium) WebExtension that lets a logged-in Lesefluss user save the current page as an article that syncs to all their devices.

Built on top of:
- TASK-119 (`POST /api/import/article` endpoint).
- TASK-120 (extension-compatible auth handoff + shared auth helper).
- TASK-118 (shared book-import package, in case the extension wants to do any client-side preprocessing).

Stack: WXT (https://wxt.dev) for one codebase that builds Chrome + Firefox MV3 artifacts.

Behaviour:
- Popup with sign-in button → `browser.identity.launchWebAuthFlow` against `/auth/extension-callback` → stores bearer token in `chrome.storage.local` via the shared auth helper.
- Browser action / popup button: "Save this page" → content script grabs `document.documentElement.outerHTML` + `location.href` + `document.title` → background posts to `/api/import/article` with bearer token → toast on success.
- Context menu: "Save selection to Lesefluss" when text is selected → posts `{ html: <selection HTML>, url, title }`.
- Sign-out clears stored token and calls `/api/auth/sign-out`.

Out of scope for v1: inline RSVP reader, settings sync, offline queue, EPUB/PDF ingestion.

Distribution: Chrome Web Store + Firefox AMO listings. Two separate review processes; same source.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 WXT-based project under `apps/extension` builds both Chrome MV3 and Firefox MV3 artifacts from one codebase
- [ ] #2 Sign-in flow uses `browser.identity.launchWebAuthFlow` and the shared auth helper from TASK-120
- [ ] #3 Bearer token persisted in `chrome.storage.local`; survives popup close and browser restart
- [ ] #4 "Save this page" captures rendered HTML and POSTs to `/api/import/article`; success toast confirms; saved article appears on web/mobile after sync
- [ ] #5 Context-menu "Save selection" sends selected HTML to the same endpoint
- [ ] #6 Sign-out clears local token and invalidates server session
- [ ] #7 Manual cross-browser smoke test passes on latest Chrome + Firefox stable
- [ ] #8 Listings prepared (icons, screenshots, store descriptions) for Chrome Web Store and Firefox AMO
<!-- AC:END -->
