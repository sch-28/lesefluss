---
id: TASK-86
title: Browser extension
status: In Progress
assignee:
  - '@OpenCode'
created_date: '2026-04-26 15:59'
updated_date: '2026-05-01 17:59'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Approved implementation plan:

1. Scaffold `apps/extension` as a WXT + React + TypeScript workspace app.
2. Add dependencies aligned with web styling: `react`, `react-dom`, `@wxt-dev/module-react`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`, `shadcn`, and `@fontsource-variable/geist`.
3. Configure WXT for Chrome MV3 and Firefox MV3 builds with scripts for dev/build/zip on both browsers plus `postinstall: wxt prepare`.
4. Configure manifest permissions: `identity`, `storage`, `contextMenus`, `notifications`, `activeTab`, `scripting`, plus `host_permissions` for the configured Lesefluss URL.
5. Pin deterministic extension IDs from the start: Chrome `key` in manifest config and Firefox `browser_specific_settings.gecko.id`; document that production must add published IDs to `LESEFLUSS_CHROME_EXTENSION_IDS` / `LESEFLUSS_FIREFOX_EXTENSION_IDS`.
6. Add WXT runtime config/env handling: `WXT_PUBLIC_LESEFLUSS_URL`, defaulting to `https://lesefluss.app`, with local override for dev.
7. Build a polished React popup: Lesefluss-like card layout, Geist font, warm dark/light tokens from `apps/web/src/styles/app.css`, lucide icons, and shadcn-style local `Button`, `Card`, `Badge`, and status UI.
8. Implement auth module using `@lesefluss/core` auth handoff helpers with a `browser.storage.local` adapter.
9. Implement sign-in with `browser.identity.launchWebAuthFlow`: create state, use `browser.identity.getRedirectURL()`, call `/auth/extension-callback`, validate returned state, extract hash token, finalize via shared helper, persist token/email.
10. Implement sign-out: clear local token/email/state and call `/api/auth/sign-out` with bearer token when available.
11. Implement background worker: create context menu, handle popup messages, run page/selection capture, call `POST /api/import/article`, and return structured status/errors.
12. Implement capture logic: full page sends `document.documentElement.outerHTML`, `location.href`, `document.title`; selection sends cloned selected range HTML with current URL/title.
13. UX behavior: popup save shows inline loading/success/error state; context-menu save uses browser notification because popup is closed.
14. Add extension README with dev setup, deterministic ID notes, env allowlist notes, Chrome/Firefox smoke-test checklist, and store listing preparation checklist.
15. Verify with extension typecheck, Chrome build, Firefox build, and broader repo checks if feasible.
16. Copy/adapt only the needed shadcn-style primitives into `apps/extension/src/components/ui` so the extension remains standalone and does not depend on web app aliases.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review/fix pass completed. Added injectable lookup dependency and positive/invalid lookup tests for the article duplicate-detection endpoint; fixed generated/local Biome exclusions for WXT artifacts and Claude local settings; fixed extension callback hook ordering/type issue; added a browser-extension section to the public privacy page covering stored auth data, explicit page/selection capture, duplicate URL lookup, and no browsing-history/analytics collection. Verification passing: `pnpm check-types`, `pnpm --filter @lesefluss/web test`, `pnpm --filter @lesefluss/extension test`, `pnpm --filter @lesefluss/extension build`, and `pnpm --filter @lesefluss/extension build:firefox`. Not finalized as Done yet because manual Chrome/Firefox smoke testing and store listing preparation acceptance criteria still need confirmation/assets.
<!-- SECTION:NOTES:END -->
