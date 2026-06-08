---
id: TASK-158
title: In-app toast nudging outdated Android users to update
status: Done
assignee: []
created_date: '2026-06-08 21:22'
updated_date: '2026-06-08 22:23'
labels:
  - app
  - android
  - ux
dependencies: []
references:
  - apps/web/src/routes/api/latest-version.ts
  - apps/capacitor/src/services/update-check/index.ts
  - apps/capacitor/src/services/update-check/compare-versions.ts
  - apps/capacitor/src/components/toast.tsx
  - apps/capacitor/src/routes/__root.tsx
modified_files:
  - apps/web/src/routes/api/latest-version.ts
  - apps/capacitor/src/services/update-check/index.ts
  - apps/capacitor/src/services/update-check/compare-versions.ts
  - apps/capacitor/src/services/update-check/compare-versions.test.ts
  - apps/capacitor/src/components/toast.tsx
  - apps/capacitor/src/routes/__root.tsx
priority: medium
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outdated no-account Android users never receive fixes (they don't see server-side changes and may not auto-update). To get reliability fixes (see TASK-157) to that cohort, the app now checks a server-published "latest version" on launch and toasts a nudge to update when the installed build is older.

Source of truth: GET /api/latest-version (apps/web) returns { android } from env var LATEST_ANDROID_VERSION. Ops sets it to the version actually live on the Play Store (NOT the latest CI build) so users are only nudged toward an installable release. Unset -> endpoint returns null -> client no-ops (feature dormant until set).

Client (apps/capacitor): checkForUpdate() runs on app mount (__root.tsx), Android-only, best-effort (never throws, no-ops without SYNC_URL). Compares App.getInfo().version against the endpoint via compareVersions; if newer, shows a warning toast with Update (opens Play Store via Browser.open) and Hide actions. Hide persists the muted version in localStorage so the user is nudged again only once an even newer version ships, not every launch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Outdated Android user sees an update toast on launch with Update (-> Play Store) and Hide actions
- [x] #2 Hide suppresses the nudge until a newer version than the muted one ships
- [x] #3 User on the latest version (or with the env unset) sees no toast
- [x] #4 Endpoint reads LATEST_ANDROID_VERSION; ops can bump without a code change
- [x] #5 compareVersions / shouldPromptUpdate unit tested
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added an in-app update nudge for outdated Android users so reliability fixes (TASK-157) reach the no-account cohort that never sees server-side changes.

Server: new GET /api/latest-version (apps/web) returns { android } from env LATEST_ANDROID_VERSION (cors + rate-limit, mirrors the telemetry route). Ops sets it to the version actually live on Play (not the latest CI build); unset returns null so the client no-ops.

Client (apps/capacitor): services/update-check/checkForUpdate() runs on app mount (__root.tsx), Android-only, best-effort (never throws, no-ops without SYNC_URL). Fetches the endpoint, compares App.getInfo().version via compareVersions, and on a newer version shows a warning toast with Update (Browser.open -> Play Store) and Hide. Hide persists the version to localStorage (lesefluss:update-muted-version) so the user is re-nudged only once an even newer version ships, not every launch. toast.tsx gained action/cancel options to back the buttons.

compareVersions + shouldPromptUpdate (pure, type-guard) extracted to compare-versions.ts with 10 unit tests. Fresh-context review: 0 must-fix; the one nice-to-have (drop an `as string` cast) was applied via a type guard.

Verified: capacitor tsc clean, 10/10 tests pass, web route registered + tsc clean. Endpoint smoke (local web, env=9.9.9): GET -> {"android":"9.9.9"}, unset -> {"android":null}, CORS preflight from capacitor://localhost -> 204. Toast appearance confirmed in-browser via a temporary preview (reverted).

Follow-up (ops, not code): set LATEST_ANDROID_VERSION on apps/web and deploy to activate; optional changelog entry once live.
<!-- SECTION:FINAL_SUMMARY:END -->
