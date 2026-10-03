---
id: TASK-191.1
title: >-
  Link-this-device sign-in: code + QR shown in app, confirmed from a phone or
  any signed-in browser
status: To Do
assignee: []
created_date: '2026-10-02 22:44'
updated_date: '2026-10-02 23:26'
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
- [ ] #1 Settings > Sync (signed out) and the onboarding sign-in step offer a 'Sign in on another device' option that shows a code and instructions
- [ ] #2 lesefluss.app/link accepts the code from a signed-in user; a signed-out user is sent through the normal login and returned to the code entry
- [ ] #3 After confirmation the app is signed in within a few seconds without any user action on the app, and a full sync runs as it does after the deep-link sign-in
- [ ] #4 Codes expire (minutes, not hours), work exactly once, and the server rate-limits both code issue and code confirm
- [ ] #5 A confirmed code cannot be redeemed by a different app instance than the one that requested it
- [ ] #6 The existing deep-link sign-in path is unchanged and still passes its tests
- [ ] #7 Integration tests cover issue, confirm, redeem, expiry, reuse and wrong-instance cases; the web page has an e2e for the happy path
- [ ] #8 docs/deep-links.md or a sibling doc describes the flow and its security properties
- [ ] #9 The code screen shows a static QR of the link URL with the code printed beneath; scanning it on a signed-in phone leads to a confirm screen that names the account, and one tap signs the e-reader in
- [ ] #10 Scanning on a signed-out phone goes through login and lands back on the confirm screen for the same code
- [ ] #11 If the phone has Lesefluss installed and /link/ is a claimed App Link, the confirm happens in the app; otherwise the website handles it (whichever is implemented is documented)
- [ ] #12 QR and code are legible on an e-ink screen with e-ink mode on (no animation, no blur, pure black on white)
<!-- AC:END -->
