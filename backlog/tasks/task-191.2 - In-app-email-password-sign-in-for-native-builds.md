---
id: TASK-191.2
title: In-app email/password sign-in for native builds
status: Done
assignee: []
created_date: '2026-10-02 22:44'
updated_date: '2026-10-03 00:46'
labels:
  - android
  - auth
  - ereader
dependencies: []
references:
  - 'https://better-auth.com/docs/plugins/bearer'
documentation:
  - apps/capacitor/src/services/sync/auth-client.ts
  - apps/web/src/lib/cors-middleware.ts
  - apps/web/src/lib/allowed-origins.ts
modified_files:
  - apps/capacitor/src/services/sync/password-sign-in.ts
  - apps/capacitor/src/services/sync/browser-sign-in.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/contexts/sync-context.tsx
  - apps/capacitor/src/components/sync/password-sign-in-form.tsx
  - apps/capacitor/src/routes/tabs/settings/sync.tsx
  - apps/capacitor/src/pages/onboarding/steps/sync.tsx
  - apps/capacitor/src/pages/social/signed-out.tsx
  - apps/capacitor/src/services/sync/__tests__/password-sign-in.test.ts
  - apps/capacitor/src/components/sync/__tests__/password-sign-in-form.test.tsx
  - apps/capacitor/e2e/sign-in-password.spec.ts
parent_task_id: TASK-191
priority: medium
ordinal: 141000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Let users with an email/password account sign in from a form inside the app, with no browser round-trip. Cheap complement to the link-code flow: the capacitor app already has a better-auth client (`syncAuthClient`), the server already runs the `bearer` plugin, and `https://localhost` (the Android WebView origin) is already in the trusted origins. What is missing is reading the `set-auth-token` response header (CORS must expose it; cors-middleware.ts does not today) and feeding it to `finalizeVerifiedAuthLoginHandoff` so the rest of the app treats it like any other session.

Why: on e-readers whose browser cannot render the website, this is the fastest route to a working account for the common case. Social providers still need a browser or the link-code flow; the form should say so and link to those paths. Sign-up, email verification and password reset stay on the website; the form only needs to handle "verify your email first" and "wrong password" errors sensibly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Settings > Sync (signed out) and onboarding offer an email + password form alongside the existing browser sign-in
- [x] #2 A successful sign-in stores the bearer token through the same finalize path as the deep-link flow and triggers the same post-login sync
- [x] #3 Unverified-email and wrong-credential responses show a clear message; unverified shows a resend option or points to the website
- [x] #4 Verified that no server change is needed: the better-auth bearer plugin already exposes `set-auth-token`, `/api/auth/$` already runs CORS for allowed origins, and the sign-in body carries the session token
- [x] #5 Not shown in the web build (cookie auth there)
- [x] #6 Unit tests for the sign-in service; e2e or manual verification against a dev server recorded in the task notes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Service `services/sync/password-sign-in.ts`: POST `${SYNC_URL}/api/auth/sign-in/email`, read `token` from the JSON body (same raw session token the deep link hands over; bearer plugin accepts it), map 401/403/429/network to typed failures with user copy.
2. `sync-context.tsx`: extract `completeLogin(token)` from the deep-link handler, expose `signInWithPassword(email, password)` that calls the service then `completeLogin`.
3. `services/sync/browser-sign-in.ts`: one `openBrowserSignIn()` helper replacing the three copied `beginAuthLoginHandoff` + `Browser.open` snippets.
4. `components/sync/password-sign-in-form.tsx`: email + password form (Field/Input), inline error copy, browser fallback button for Google/Discord; hidden in web build.
5. Mount in Settings > Sync signed-out section and in the onboarding sign-in step (footer becomes "Not now" only).
6. Tests: service unit tests (fetch stub), form component test (render helper), e2e with routed auth endpoints.
7. No server change: better-auth bearer plugin already emits `set-auth-token` and `Access-Control-Expose-Headers`; `/api/auth/$` already has CORS; `https://localhost` already trusted.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Server needs nothing: `POST /api/auth/sign-in/email` returns `{ token: session.token }` (better-auth `api/routes/sign-in.mjs:261`), the raw session token the website's `/auth/mobile-callback` already hands over, and the bearer plugin's before-hook signs unsigned tokens itself (`requireSignature` off). The bearer after-hook also sets `set-auth-token` + `Access-Control-Expose-Headers` on its own, so the header path would have worked too; the body is simpler. `/api/auth/$` route already has the `cors` middleware and `https://localhost` is in `ALLOWED_ORIGINS`.

Client: `services/sync/password-sign-in.ts` (fetch, typed `PasswordSignInError` with reasons invalid-credentials / email-not-verified / rate-limited / offline / unknown, user copy in `passwordSignInMessage`). `services/sync/browser-sign-in.ts` holds the one `openBrowserSignIn()` the three former copies now call. `sync-context.tsx`: the deep-link handler's completion block became `completeLogin(token)` in the provider; `signInWithPassword` on the context calls the service then `completeLogin`, rethrowing so the form shows the message inline (the context only toasts success; the deep-link path keeps toasting its own failures). `components/sync/password-sign-in-form.tsx` renders null unless `NATIVE_SYNC_ENABLED`; includes the browser fallback button for Google/Discord and sign-up, with an optional `beforeBrowserSignIn` so onboarding still finishes before leaving the app. Mounted in Settings > Sync (native branch) and the onboarding sign-in step (footer now only "Not now"). Social signed-out page keeps the browser button and links to Settings for email.

Behaviour notes: better-auth rate-limits `/sign-in` at 3 per 10 s per IP, surfaced as "Too many attempts". An unverified account gets a 403 and the server re-sends the verification mail on every attempt (`sendOnSignIn: true`), which the copy tells the user. No "Forgot password?" link: the website has no reset page yet (follow-up). `syncAuthClient` / the better-auth client dependency in the app remain unused (follow-up cleanup).

Verification: `vitest run` 109 files / 997 tests green (7 new: service, 4 new: form component); e2e `sign-in-password.spec.ts` (happy path with routed auth + empty sync payload, and 401 inline error) and `onboarding.spec.ts` green; biome clean; tsc only the pre-existing `pages/reader/index.tsx:1913` error. Not yet exercised on a device or against a real server: do that on the Boox once the batch ships.

Review pass (3 fresh-context reviewers: conventions, correctness, security; plus an adversarial verifier). 12 findings, 10 confirmed, 2 refuted (redundant `setSyncError` in `signInWithPassword` is not redundant: it clears a stale error when the password request itself fails; `React.FormEvent` is deprecated in @types/react 19.2, so `SyntheticEvent` stays). Fixed: (1) any 403 other than `EMAIL_NOT_VERIFIED` was shown as "we sent a verification link" (e.g. better-auth `INVALID_ORIGIN`); now only the error code selects that copy. (2) `completeLogin` no longer sets `syncError` for a failed token check, so the Settings page does not show the same message twice; the deep-link handler sets it itself as before. (3) A failed first sync after a successful password sign-in was silent (the form unmounts on `isLoggedIn`); `completeLogin` now reports the sync failure itself (toast + `syncError`) and still toasts "Signed in as". (4) Browser fallback button now catches `openBrowserSignIn` rejections and shows "Couldn't open a browser on this device." Also removed the unused `onSignedIn` prop and unused re-exports, used `Page` from Playwright in the e2e, dropped a dead catch assignment and an avoidable cast in tests, and shortened a positional comment. Security reviewer found nothing: no cookie is sent (cross-origin fetch, default credentials), no nonce needed (no deep link involved), no credential/token logging, error copy maps by code only, better-auth returns the same 401 for unknown email and wrong password. After fixes: biome clean, tsc clean, vitest 999 green, e2e sign-in-password + onboarding green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Native builds can now sign in with email and password inside the app, with no browser round-trip. The form lives in Settings > Sync (signed out) and in the onboarding sign-in step, with a "Sign in in your browser" fallback for Google, Discord and sign-up. It posts to the sync server's better-auth sign-in endpoint, takes the session token from the response body and finishes through the same `completeLogin` path the deep-link sign-in uses, so sync, social and sign-out behave identically. Wrong password, unverified email (with the note that a new verification mail was sent), rate limiting and offline each show a clear inline message. Hidden in the web build. No server changes were needed. Three copies of the browser sign-in snippet collapsed into one helper.

Tests: 11 new unit/component tests, 2 new e2e cases; full suites green.
<!-- SECTION:FINAL_SUMMARY:END -->
