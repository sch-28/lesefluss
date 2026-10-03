---
id: TASK-191.1
title: >-
  Link-this-device sign-in: code + QR shown in app, confirmed from a phone or
  any signed-in browser
status: Done
assignee: []
created_date: '2026-10-02 22:44'
updated_date: '2026-10-03 01:32'
labels:
  - android
  - auth
  - web
  - ereader
dependencies: []
references:
  - >-
    https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/
documentation:
  - docs/deep-links.md
  - packages/core/src/auth-handoff.ts
  - apps/web/src/routes/auth/mobile-callback.tsx
modified_files:
  - packages/core/src/device-link.ts
  - packages/core/src/__tests__/device-link.test.ts
  - packages/core/src/index.ts
  - apps/web/src/lib/auth.ts
  - apps/web/src/lib/device-link-code.ts
  - apps/web/src/lib/device-link.ts
  - apps/web/src/lib/device-link.integration.test.ts
  - apps/web/src/db/auth-schema.ts
  - apps/web/drizzle/0032_device_code.sql
  - apps/web/drizzle/meta/_journal.json
  - apps/web/drizzle.config.ts
  - apps/web/src/routes/link/index.tsx
  - apps/web/src/routeTree.gen.ts
  - apps/capacitor/package.json
  - apps/capacitor/src/services/sync/device-sign-in.ts
  - apps/capacitor/src/services/sync/__tests__/device-sign-in.test.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/contexts/sync-context.tsx
  - apps/capacitor/src/components/sync/use-device-sign-in.ts
  - apps/capacitor/src/components/sync/__tests__/use-device-sign-in.test.tsx
  - apps/capacitor/src/components/sync/phone-sign-in-dialog.tsx
  - apps/capacitor/src/components/sync/password-sign-in-form.tsx
  - apps/capacitor/src/pages/social/signed-out.tsx
  - apps/capacitor/e2e/helpers/auth-mock.ts
  - apps/capacitor/e2e/sign-in-phone.spec.ts
  - apps/capacitor/e2e/sign-in-password.spec.ts
  - apps/capacitor/e2e-app/link-device.spec.ts
  - docs/deep-links.md
parent_task_id: TASK-191
priority: high
ordinal: 140000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Give the app a sign-in path that never depends on the device's own browser. The app shows a short, human-typable code (TV-style device flow) and the same code as a QR. The user either scans the QR with their phone, or opens lesefluss.app/link on any device where they are or can get signed in (phone, laptop, even the e-reader's browser if it happens to work) and types the code. On confirm, the app receives a session token.

QR: encodes `https://lesefluss.app/link?code=<code>`. The phone camera opens it; a signed-in phone shows one Confirm tap, a signed-out phone goes through normal login and returns to the confirm screen. Rendered as a static SVG (no canvas, no animation) with the plain code printed beneath it, so it reads on e-ink and still works when the camera cannot focus. If `/link/` is added to the claimed App Link paths (see docs/deep-links.md, currently only `/invite/`), a phone with Lesefluss installed opens the app directly and confirms with its bearer session, no browser needed on either side. Treat that as in scope if cheap, otherwise note it in the task.

Why: on Boox e-readers the Custom Tabs sign-in falls back to NeoBrowser, an old Chromium that cannot render the login page. Loading the page in the app's WebView is not an option because Google OAuth rejects embedded WebViews. A code flow sidesteps the browser entirely and covers every provider (email, Google, Discord) at once.

Essential context for the implementer: native sign-in today is `beginAuthLoginHandoff` + `Browser.open(.../auth/mobile-callback?state=...)` + the `lesefluss://auth-callback` deep link handled in sync-context, finishing with `finalizeVerifiedAuthLoginHandoff(token)` which stores a better-auth bearer token. The new flow must end in the same finalize call so sync, social and sign-out behave identically. Server is better-auth with the `bearer` plugin; sessions are the regular better-auth sessions. Codes must be short-lived, single-use, rate-limited, and bound to the requesting app instance so a guessed code cannot hijack another user's app. The confirming side must see which account it is about to sign in on the other device before confirming. The mobile-callback redirect path stays as the default; the code path is offered as "Sign in with your phone / another device" next to it in Settings > Sync and in onboarding.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Settings > Sync (signed out) and the onboarding sign-in step offer a 'Sign in on another device' option that shows a code and instructions
- [x] #2 lesefluss.app/link accepts the code from a signed-in user; a signed-out user is sent through the normal login and returned to the code entry
- [x] #3 After confirmation the app is signed in within a few seconds without any user action on the app, and a full sync runs as it does after the deep-link sign-in
- [x] #4 Codes expire (minutes, not hours), work exactly once, and the server rate-limits both code issue and code confirm
- [x] #5 A confirmed code cannot be redeemed by a different app instance than the one that requested it
- [x] #6 The existing deep-link sign-in path is unchanged and still passes its tests
- [x] #7 Integration tests cover issue, confirm, redeem, expiry, reuse and wrong-instance cases; the web page has an e2e for the happy path
- [x] #8 docs/deep-links.md or a sibling doc describes the flow and its security properties
- [x] #9 The code screen shows a static QR of the link URL with the code printed beneath; scanning it on a signed-in phone leads to a confirm screen that names the account, and one tap signs the e-reader in
- [x] #10 Scanning on a signed-out phone goes through login and lands back on the confirm screen for the same code
- [x] #11 If the phone has Lesefluss installed and /link/ is a claimed App Link, the confirm happens in the app; otherwise the website handles it (whichever is implemented is documented)
- [x] #12 QR and code are legible on an e-ink screen with e-ink mode on (no animation, no blur, pure black on white)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use better-auth's built-in `deviceAuthorization` plugin (RFC 8628) instead of custom endpoints: `/api/auth/device/code` issues device_code (app secret) + user_code; `/api/auth/device/approve|deny` need a session; `/api/auth/device/token` polls with interval enforcement and returns a session token on approval, deleting the code (single use).
1. Server: plugin config in `lib/auth.ts` (10 min TTL, 3 s interval, 8-char unambiguous user code, client id check, verification URI `/link`, custom rate-limit rules); `deviceCode` table in `db/auth-schema.ts` + hand-written migration 0032 + journal + tablesFilter.
2. Website: `routes/link/index.tsx` (signed-out → login redirect keeping the code; signed-in → shows account, code input, Approve/Deny, success/error states) backed by server fns in `lib/device-link.ts` calling `auth.api.deviceVerify/deviceApprove/deviceDeny`.
3. Shared: `packages/core/src/device-link.ts` (client id, alphabet, format/normalise helpers).
4. App: `services/sync/device-sign-in.ts` (request code, poll token), `signInWithSessionToken` on sync context, `components/sync/phone-sign-in-dialog.tsx` (QR via `uqr` renderSVG, code text, polling while open/foreground/online), button in the password sign-in form.
5. Tests: core unit, web integration (full flow through auth.api), app unit + component, dev e2e with routed endpoints, website e2e in e2e-app.
6. docs/deep-links.md section; App Link claim for `/link/` deferred.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built on better-auth 1.6.3's `deviceAuthorization` plugin (RFC 8628) rather than custom endpoints; verified its routes in `node_modules/better-auth/dist/plugins/device-authorization/routes.mjs`: `/device/code` issues a 40-char `device_code` (the app's secret) and the `user_code`; `/device/approve` and `/device/deny` need a session (bearer works through `auth.api` too); `/device/token` refuses polls faster than the interval (`slow_down`), deletes the row on expiry/denial/redemption and returns `access_token = session.token`, which the bearer plugin accepts.

Server (apps/web): plugin in `lib/auth.ts` (10 min TTL, 3 s interval, `generateUserCode` from `lib/device-link-code.ts` over the 32-char alphabet in `@lesefluss/core` `device-link.ts`, `validateClient` = `lesefluss-app`, absolute `verificationUri` `${BETTER_AUTH_URL}/link`, `rateLimit.customRules` for `/device/code|approve|deny` and `/device`). `deviceCode` pgTable in `db/auth-schema.ts` (table `device_code`, keys match the plugin's field names; createdAt/updatedAt included), hand-written `drizzle/0032_device_code.sql` + journal entry, `device_code` added to `drizzle.config.ts` tablesFilter. Page `routes/link/index.tsx` (search `user_code` or `code`, coerced since TanStack parses numerics) over server fns in `lib/device-link.ts` (`lookupDeviceLink`, `approveDeviceLink`, `denyDeviceLink`; per-IP `checkLimit`; the plugin reports an unknown and an already decided code both as `invalid_request`, so a status read tells them apart).

App (apps/capacitor): `uqr` 0.1.3 added for `renderSVG`. `services/sync/device-sign-in.ts` (`requestDeviceCode`, `pollDeviceToken`, `DeviceSignInError` expired/denied/offline/unknown). `signInWithSessionToken` on the sync context (same `completeLogin` tail as password and deep link). `components/sync/use-device-sign-in.ts` runs one attempt per activation: request, then a setTimeout loop at the server interval, doubling on slow-down, skipping polls while backgrounded/offline (refs), retrying through offline errors, failing on terminal errors, local expiry guard; `restart` bumps an attempt counter (biome suppression documents the intentional dependency). `components/sync/phone-sign-in-dialog.tsx` (Modal: QR as static black-on-white SVG via `dangerouslySetInnerHTML` of encoder output, `ABCD-2345` monospace, host hint, status line, New code / Cancel). Button "Sign in with your phone" in `password-sign-in-form.tsx`, so Settings > Sync and onboarding both have it.

Deferred: claiming `/link/` as an App Link with an in-app confirm screen (documented in docs/deep-links.md, "Device link sign-in"). Not done: a scheduled cleanup of expired `device_code` rows (the plugin deletes them lazily on the next poll or approve attempt; the table stays tiny).

Verification: core 161 tests; web unit 86 + the new `device-link.integration.test.ts` (6 tests) run against a throwaway Postgres created and migrated by a scratch script (dev DB untouched); capacitor 1008 unit tests incl. 7 service + 5 hook tests; dev e2e `sign-in-phone.spec.ts` (approval and expired paths) and `sign-in-password.spec.ts` (now on the shared `e2e/helpers/auth-mock.ts`); website e2e `e2e-app/link-device.spec.ts` (signed-out → login → approve → app polls token → get-session works → single use; deny path) 4/4 on the production build with a throwaway DB. biome and tsc clean in web and capacitor. Not yet tried on a physical device or the Boox; do that when the batch ships. One finding during the integration test: `lib/auth.ts` requires `RESEND_API_KEY` at import, so tests importing it must stub it.

Review pass (4 fresh-context opus reviewers: conventions, app correctness, server/page correctness, security; plus an adversarial opus verifier): 23 findings, 17 confirmed, 4 refuted (inline rate-limit numbers are the repo convention; feature hooks are colocated, not in src/hooks; runaway slow-down backoff is unreachable because the server sets lastPolledAt before it can answer slow_down twice; generic helper names in small private modules), 2 uncertain, 1 not ours (the `buddy-trailer` export in core's index is a leftover of the user's landing-page commit). Fixed: (1) `/device/token` had no custom rate-limit rule; better-auth's counter only resets after a full idle window, so 3 s polls would 429 on the 11th poll in production (`{ window: 2, max: 5 }` added; the client also maps 429 to slow-down). (2) An approval arriving while the dialog was being closed was dropped, orphaning the freshly minted session; the hook now finishes the sign-in even after cancel. (3) Reopening the dialog flashed the previous attempt's code; state resets in the effect cleanup. (4) The dead QR and code stayed visible under an expired/denied message; only shown while waiting or finishing. (5) The app stopped polling at local expiry so the server never saw the poll that deletes expired rows; the last poll is now scheduled at expiry. (6) Device-code phishing: the /link page now warns against codes received from others and enables Approve only after a required checkbox confirming the device is in front of the user; Approve is no longer a form submit. (7) Rate-limited page requests returned "invalid" with misleading copy; a distinct "rate-limited" state. (8) Pasting the whole link into the code field threw in the server fn (zod max 32); client-side validation plus a 200 limit. (9) Unused unauthenticated `lookupDeviceLink` server fn removed; approve/deny merged into one `decideDeviceLink`. (10) Integration test now deletes the device codes it issued (unapproved rows have no user_id and escaped the cascade). (11) Grant type and the generic failure copy became shared constants; `DevicePollResult` used; `APIError.body` read without a cast; handler names follow `handleX`; QR rendered as an SVG `<path>` from `encode()` instead of innerHTML. Docs corrected: better-auth's limiter covers direct API hits only, the page limits itself; phishing mitigation described. Deployment follow-ups, not code: better-auth keys its limiter on the leftmost `x-forwarded-for` and skips limiting when absent (consider `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]` once the origin only accepts Cloudflare traffic); abandoned device_code rows (dialog closed before expiry) are never deleted, a periodic `DELETE … WHERE expires_at < now()` would keep the table tidy. After fixes: core 161, web 86 + integration 6 (throwaway DB), capacitor 1010, dev e2e 4/4, website e2e 4/4, biome and tsc clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The app can now sign in through a code confirmed on another device. "Sign in with your phone" (Settings > Sync and onboarding) shows an 8-character code as text and as a static QR of `lesefluss.app/link?user_code=…`. Scanning it on a phone, or typing the code at /link on any browser, leads to a page that names the signed-in account and offers Approve or Deny; signed-out visitors go through /login and come back to the same code. The app polls at the server's interval and, on approval, finishes through the same sign-in completion as the deep-link and password paths, so sync and social behave identically.

Server side this is better-auth's RFC 8628 device-authorization plugin: codes live 10 minutes, work once, are bound to the requesting app through a secret device code that never leaves it, and approve/deny require a session; code issue, approve, deny and lookup are rate-limited per IP and polling faster than the interval is refused. New `device_code` table with migration 0032. Claiming /link/ as an Android App Link for in-app confirmation is deferred and documented in docs/deep-links.md.

Tests: core unit, web integration (full flow incl. reuse, expiry, denial, wrong client, missing session) on a throwaway Postgres, app unit + hook tests, dev e2e for the dialog, website e2e for the confirm page. All suites, biome and tsc green.
<!-- SECTION:FINAL_SUMMARY:END -->
