---
id: TASK-120
title: Extension-compatible auth handoff
status: Done
assignee:
  - '@OpenCode'
created_date: '2026-05-01 13:45'
updated_date: '2026-05-01 15:40'
labels: []
milestone: m-9
dependencies: []
ordinal: 1900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Generalise the existing mobile auth handoff so the browser extension can reuse it.

Today: `apps/web/src/routes/auth/mobile-callback.tsx` mints a session token from the cookie session and redirects to `lesefluss://auth-callback?token=…&state=…`. Capacitor handles the deep link via `services/sync/index.ts` (`beginMobileLogin` / `consumeAuthState` / `finalizeVerifiedLogin`).

Changes:
- Add a sibling route `/auth/extension-callback` that does the same token-mint as `mobile-callback` but redirects to a URL passed as a query parameter (validated against an allowlist).
- Allowlist `https://*.chromiumapp.org` (Chrome extension redirect URI host) and `https://*.extensions.allizom.org` (Firefox) in `apps/web/src/lib/allowed-origins.ts`.
- Factor `beginMobileLogin` / `consumeAuthState` / `finalizeVerifiedLogin` into a storage-agnostic helper (likely in `packages/core`), with an injectable storage adapter interface (`get(key)`, `set(key, value)`, `remove(key)`).
- Capacitor consumes the helper with a `Preferences`-backed adapter — no behaviour change.
- Extension (TASK-86) will consume the same helper with a `chrome.storage.local`-backed adapter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `/auth/extension-callback` route mints a session token and redirects to a query-param redirect URI from an allowlist
- [x] #2 Allowlist covers `https://<id>.chromiumapp.org` and `https://<id>.extensions.allizom.org` patterns
- [x] #3 Auth handoff helper extracted to a shared package with a storage adapter interface
- [x] #4 Capacitor auth flow uses the shared helper with a Preferences adapter; mobile login still works end-to-end
- [x] #5 State-nonce protection preserved (single-use, race-safe consume)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Approved implementation plan:

1. Add a storage-agnostic auth handoff helper in `packages/core` with a minimal adapter interface: `get(key)`, `set(key, value)`, and `remove(key)`. Keep nonce generation, single-use consume, and in-flight race protection inside the helper, not inside adapters, so future `chrome.storage.local` adapters do not need concurrency logic.
2. Refactor Capacitor sync auth to consume the shared helper through a `Preferences`-backed adapter. Rename the public flow API from mobile-specific names to handoff-specific names and update the two callers (`pages/settings/sync.tsx`, `pages/onboarding/steps/sync.tsx`) plus the deep-link consumer. Preserve the existing token/email storage keys and native mobile behavior.
3. Keep redirect-URI validation separate from CORS. Add strict server-side redirect validation for `/auth/extension-callback`: only `https://[a-z0-9]{32}.chromiumapp.org/` and `https://[a-z0-9]{32}.extensions.allizom.org/` are accepted, with no extra path, query, or fragment beyond the generated redirect URI.
4. Keep CORS/API origin validation separate from redirect validation. Extend origin handling for extension API calls with `chrome-extension://<id>` and `moz-extension://<id>` origins, while preserving exact existing origins for Capacitor/web. Avoid treating `chromiumapp.org` / `extensions.allizom.org` as CORS origins.
5. Add a sibling TanStack route `/auth/extension-callback` that mints the same Better Auth session token from the cookie session as mobile callback, requires a valid `redirect_uri`, preserves optional `state`, redirects unauthenticated users through `/login`, and sends the user/token/state back to the validated redirect URI.
6. Add focused tests for strict redirect URI validation, extension origin validation, and shared handoff helper single-use/race-safe behavior. Add or keep a small integration-style Capacitor auth helper test to verify the refactor preserves the mobile login storage/token behavior.
7. Verify with package/app type checks and targeted tests: `pnpm --filter @lesefluss/core check-types`, `pnpm --filter @lesefluss/web check-types`, and `pnpm --filter lesefluss check-types` where feasible.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Finalization check: `/auth/extension-callback` exists and mints Better Auth session tokens from cookie sessions; extension redirect URI validation is separate from CORS origin validation. Production extension redirects/origins require configured IDs via `LESEFLUSS_CHROME_EXTENSION_IDS` / `LESEFLUSS_FIREFOX_EXTENSION_IDS`; broad syntactic patterns remain available only outside production for development. Shared auth handoff helpers now live in `@lesefluss/core` with storage adapter methods `get`, `set`, `remove`; state consume locking stays in the helper and is single-use/race-safe. Capacitor uses a Preferences-backed adapter and keeps the mobile deep-link flow behavior through renamed handoff functions. Verification passed with root `pnpm check-types`, including Biome, all workspace typechecks, Capacitor Vitest, and ESP32 Python compile. Unrestricted repo scan confirms no remaining `rsvp-core` references.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary
- Added `/auth/extension-callback` for browser-extension auth handoff, reusing the existing cookie-session token minting flow and validating extension redirect URIs separately from CORS origins.
- Extracted storage-agnostic auth handoff helpers into `@lesefluss/core`, including minimal storage adapter support and helper-owned single-use/race-safe state consume protection.
- Refactored Capacitor sync auth to use the shared helper through a Preferences adapter while preserving native mobile deep-link login behavior.
- Added extension origin handling for API/CORS use, with production configured-ID allowlists and dev-only broad syntactic matching for Chrome/Firefox extension workflows.
- Renamed the shared package from `@lesefluss/rsvp-core` / `packages/rsvp-core` to `@lesefluss/core` / `packages/core` and updated imports, docs, Dockerfiles, ESP32 comments, lockfile, and backlog references.

## Verification
- `pnpm check-types` passed end-to-end: Biome, Turbo workspace typechecks, Capacitor Vitest suite, and ESP32 Python compile.
- Unrestricted repo scan for `@lesefluss/rsvp-core|packages/rsvp-core|rsvp-core` returns no matches.
<!-- SECTION:FINAL_SUMMARY:END -->
