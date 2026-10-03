---
id: TASK-191.5
title: >-
  Website: plain-HTML notice on /login and /auth/mobile-callback when the
  browser is too old
status: To Do
assignee: []
created_date: '2026-10-02 22:44'
labels:
  - web
  - auth
  - ereader
dependencies: []
documentation:
  - apps/web/src/routes/login/index.tsx
  - apps/web/src/routes/auth/mobile-callback.tsx
parent_task_id: TASK-191
priority: low
ordinal: 144000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the login page is opened in a browser that cannot run the site (Tailwind v4 needs Chrome 111+ / Safari 16.4+ / Firefox 128+; the JS bundle needs roughly Chrome 107+), the user currently sees an unstyled page with a form that silently does nothing. Show a server-rendered, inline-styled notice that works with no CSS framework and no module JS: "Your browser is too old to sign in here. Sign in from the app with a code or from another device." Detect with a tiny classic inline script (feature check such as CSS.supports('color', 'oklch(0 0 0)') or a known-unsupported syntax guard), keep the notice above the form so the form stays usable on borderline browsers.

Why: e-reader browsers (Boox NeoBrowser) and TV/kiosk browsers land here from the app's sign-in button. A dead page with no explanation is the worst outcome; a one-line explanation with the alternatives turns it into a recoverable one. Keep it tiny; the real fixes are the in-app sign-in paths.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Opening /login or /auth/mobile-callback in a browser without oklch or cascade-layer support shows a readable, styled-inline notice at the top, with a link to the app's alternative sign-in instructions
- [ ] #2 Modern browsers show no notice and the page is unchanged (existing login e2e passes)
- [ ] #3 The notice is rendered server-side and uses no Tailwind classes or module scripts
- [ ] #4 Unit test for the detection snippet in both branches
<!-- AC:END -->
