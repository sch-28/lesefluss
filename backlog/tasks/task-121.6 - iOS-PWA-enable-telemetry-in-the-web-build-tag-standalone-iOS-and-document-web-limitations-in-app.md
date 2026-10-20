---
id: TASK-121.6
title: >-
  iOS PWA: enable telemetry in the web build, tag standalone/iOS, and document
  web limitations in-app
status: To Do
assignee: []
created_date: '2026-10-20 22:05'
labels:
  - pwa
  - ios
  - web
  - telemetry
milestone: m-14
dependencies: []
references:
  - apps/capacitor/src/services/telemetry/index.ts
  - apps/web/Dockerfile
  - packages/core/src/engine-support.ts
  - apps/capacitor/vite.config.ts
parent_task_id: TASK-121
priority: medium
ordinal: 171000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
We cannot triage iOS PWA problems blind, and today the web build sends no telemetry at all:
- The web Dockerfile builds the app with `VITE_SYNC_URL=""` (`apps/web/Dockerfile`), and `reportEvent` returns early when `SYNC_URL` is empty (`services/telemetry/index.ts`). The engine check's telemetry URL in `apps/capacitor/vite.config.ts` is derived from the same variable, so it is empty too.
- Even when sent, `platform` is always `"web"` and the engine version is parsed only from `Chrome/` in the user agent (`packages/core/src/engine-support.ts`), so Safari reports `unknown`.

Make the web build report to the same-origin telemetry endpoint (`/api/telemetry`), and tag events with whether the app runs standalone (`matchMedia('(display-mode: standalone)')` or `navigator.standalone`) plus the iOS/Safari version, so iOS PWA, Safari tab and desktop web can be told apart.

Also add a short in-app note on the web build listing what is not available there (rsvpnano device, read-aloud, reminders and notifications, volume keys, folder scan), so users don't hunt for missing features. This covers TASK-121 acceptance criterion #3. English only: the app has no i18n.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The /app build sends telemetry events to the same-origin /api/telemetry, including the engine check's webview_unsupported event
- [ ] #2 Events from the web build carry standalone vs browser and the Safari/iOS version (not 'unknown')
- [ ] #3 Telemetry stays opt-out-able exactly as on Android
- [ ] #4 The web build shows a short note listing the features unavailable on the web
- [ ] #5 Unit tests for the platform/standalone tagging; pnpm e2e:app checks an event reaches /api/telemetry
<!-- AC:END -->
