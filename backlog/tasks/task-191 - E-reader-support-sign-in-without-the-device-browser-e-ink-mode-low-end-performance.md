---
id: TASK-191
title: >-
  E-reader support: sign in without the device browser, e-ink mode, low-end
  performance
status: Done
assignee: []
created_date: '2026-10-02 22:43'
updated_date: '2026-10-03 22:07'
labels:
  - android
  - ereader
  - e-ink
dependencies: []
references:
  - >-
    https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/
  - >-
    https://help.boox.com/hc/en-us/community/posts/37955597317780-Neobrowser-fails-to-render-many-website-alternative-browsers
priority: high
ordinal: 139000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Android e-readers (Onyx Boox and similar e-ink tablets, plus cheap low-end tablets) are a natural home for a reading app, but today Lesefluss is barely usable on them. Umbrella for the investigation done on 2026-10-03; each subtask is independently shippable.

**Problem 1: sign-in is impossible on Boox.** The app signs in by opening `${SYNC_URL}/auth/mobile-callback` through `@capacitor/browser` (Chrome Custom Tabs). Boox has no Chrome, so the intent falls to the default browser, NeoBrowser, which is pinned to an old Chromium (community reports put it around Chromium 85, 2020). The website is built with Tailwind v4 (cascade layers, oklch, @property: needs Chrome 111+) and Vite 8's default JS target (Chrome 107+), so the login page shows unstyled and its form never hydrates. There is no fallback path: no in-app form, no code-based link flow. Note: loading the login page in the app's own WebView is NOT a fix, because Google OAuth rejects embedded WebViews (`disallowed_useragent`).

**Problem 2: no e-ink mode.** Only page-turn animation can be switched off (TASK-116). Everything else still animates on e-ink: tw-animate-css enter/exit on sheets, dialogs and popovers, framer-motion in social and stats, 13 backdrop-blur surfaces, spinners and skeleton shimmer, colour transitions on every tap, finger-follow page drags, progress-bar fades, the explore marquee. `prefers-reduced-motion` is honoured in only 3 components. There is no high-contrast theme; the light theme uses low-contrast greys and soft borders that wash out on e-ink.

**Problem 3: performance on low-end hardware.** Unmeasured. Likely suspects: backdrop-blur and box-shadow compositing, framer-motion, VList reconciliation and the rAF fine-scroll chain in scroll mode, large reader re-renders. Needs profiling on a real device before fixing; Settings > Diagnostics already shows the WebView version, telemetry does not yet record it.

Existing related work: TASK-116 (page-turn animation toggle, device-local setting pattern to reuse), TASK-189 (settings rework in progress; e-ink mode should land on the new General page), TASK-130 (monochrome.css cleanup).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A user on a Boox device with no Chrome installed can sign in with any supported method (email/password, Google, Discord)
- [x] #2 An e-ink mode exists that removes motion, blur and low-contrast styling across the whole app and defaults the reader to instant page turns
- [x] #3 Reader open, page turn and library scroll are measured on an e-ink device and the worst offenders are fixed
- [x] #4 All subtasks done
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Correction (2026-10-03, read-only adb probe of a Boox Nova Air 2): NeoBrowser there is `org.chromium.chrome` 111.0.5563, not ~Chromium 85 as stated in the description. Chrome 111 is the floor the website officially supports, and a scan of the built site found no JS API and no CSS feature beyond it (only `text-wrap`, which degrades harmlessly). So the login failure reported on that device in July is not explained by an old engine; its cause is open and was not reproduced. The user also reports DuckDuckGo (now the default browser there) was too heavy to use. Either way the fix stands: nobody should have to use a browser or type credentials on an e-reader, which is what TASK-191.1 (phone/QR) and TASK-191.2 (in-app form) deliver. Scope note from the user: the target is every kind of e-reader including cheap ones, not this (comparatively strong) device; see TASK-191.6 for the WebView floor that currently excludes low-end devices.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
E-reader support delivered across five subtasks (TASK-191.5 folded into .6 and archived):
- Sign-in without the device browser: phone/QR device link (191.1) and in-app email/password (191.2), verified on the Boox.
- E-ink mode (191.3): device-local setting removing motion, blur and low contrast, instant page turns.
- Performance (191.4): measured on the Boox at 1x and 3x CPU; page-mode open about 2.8x faster, worst page turn 668 -> 205 ms; renderer-crash recovery and WebView-reload DB fix.
- Old WebViews (191.6): self-contained notice below Chromium 111 instead of a blank app, website login notice, PDF import fixed for 111-123, floor decision recorded; telemetry now reports WebView versions to guide a lower floor later.
<!-- SECTION:FINAL_SUMMARY:END -->
