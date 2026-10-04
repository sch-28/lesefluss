---
id: TASK-195
title: 'Invite web page: cover-lit redesign and hand-off to the Android app'
status: Done
assignee: []
created_date: '2026-10-04 15:16'
updated_date: '2026-10-04 15:54'
labels:
  - social
  - web
dependencies: []
references:
  - TASK-171.16
modified_files:
  - apps/web/src/routes/invite/$token.tsx
  - apps/web/src/components/invite-app-cta.tsx
  - apps/web/src/components/cover-lit-buddy-card.tsx
  - apps/web/src/components/google-play-badge.tsx
  - apps/web/src/lib/store-links.ts
  - apps/web/src/lib/store-links.test.ts
  - apps/web/src/lib/use-is-android.ts
  - apps/web/src/routes/index.tsx
  - apps/web/src/routes/download/index.tsx
  - docs/deep-links.md
ordinal: 150000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
/invite/<token> was a plain white column with a left-aligned Play badge, the main action last and no way into the app, also after accepting. Redesign with the landing page's cover-lit buddy-read card, inviter on it, main action first; Android gets "Open in Lesefluss" via an intent:// URL (works without App Link verification, Play Store fallback), and accepting on Android opens the app right away.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Invite page uses cover-lit trailer card with inviter, main action first
- [x] #2 Android shows Open in Lesefluss (intent with Play fallback)
- [x] #3 Success state offers Open Lesefluss on Android plus Open the web app; no automatic redirect
- [x] #4 Play badge full-width and centred
- [x] #5 Verified on a real Android phone
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Auto-redirect after accept dropped after review: intent with package falls back to Play Store when the app is missing (yanks web-only Android users off the success page), and Chrome blocks it silently when redeem outlasts user activation. Success state: Open Lesefluss (Android intent) + Open the web app. Cover-lit card and Play badge extracted and reused on landing and download pages. Remaining: on-device check (AC #5); App Link verification itself is TASK-171.16.

Device check (Pixel 8 Pro, debug build vs local server via adb reverse): Android page shows Open in Lesefluss; intent opens the app warm and cold, signed in and signed out; signed-out link is stored and replayed after sign-in; success state shows Open Lesefluss + Open the web app with no redirect. One unreproduced miss: first launch right after `adb install -r`, signed out, landed on Library instead of the invite; four later attempts (warm/cold x signed in/out) all worked.
<!-- SECTION:NOTES:END -->
