---
id: TASK-191.2
title: In-app email/password sign-in for native builds
status: To Do
assignee: []
created_date: '2026-10-02 22:44'
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
- [ ] #1 Settings > Sync (signed out) and onboarding offer an email + password form alongside the existing browser sign-in
- [ ] #2 A successful sign-in stores the bearer token through the same finalize path as the deep-link flow and triggers the same post-login sync
- [ ] #3 Unverified-email and wrong-credential responses show a clear message; unverified shows a resend option or points to the website
- [ ] #4 The `set-auth-token` header is exposed through CORS only for allowed origins; a unit test covers the middleware change
- [ ] #5 Not shown in the web build (cookie auth there)
- [ ] #6 Unit tests for the sign-in service; e2e or manual verification against a dev server recorded in the task notes
<!-- AC:END -->
