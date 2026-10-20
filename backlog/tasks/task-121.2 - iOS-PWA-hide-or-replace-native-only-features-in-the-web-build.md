---
id: TASK-121.2
title: >-
  iOS PWA: audit native-only features on web, cover them with e2e, and handle
  external links in standalone
status: To Do
assignee: []
created_date: '2026-10-20 21:58'
updated_date: '2026-10-20 22:06'
labels:
  - pwa
  - ios
  - web
milestone: m-14
dependencies: []
references:
  - apps/capacitor/src/utils/platform.ts
  - apps/capacitor/src/services/tts/index.ts
  - apps/capacitor/src/services/volume-keys/index.ts
  - apps/capacitor/src/services/book-import/sources/folder-scan.ts
  - apps/capacitor/src/services/goal-reminders/index.ts
  - apps/capacitor/src/services/push/index.ts
  - apps/capacitor/src/services/haptics.ts
  - apps/capacitor/src/services/ble/client.ts
parent_task_id: TASK-121
priority: low
ordinal: 167000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Most native-only features are already hidden on the web build. This task confirms that nothing slipped through, locks it in with tests, and fixes links that leave the installed app.

## Already gated (verify)
- Read-aloud: `IS_READ_ALOUD_SUPPORTED` (`services/tts/index.ts`).
- Volume keys: `IS_VOLUME_KEYS_SUPPORTED` (reader appearance popover).
- Goal reminders: `areRemindersSupported` (goal setup sheet).
- Push: `isPushSupported` (settings).
- Haptics: already a silent no-op (`services/haptics.ts`).
- Folder scan: becomes "Import multiple files" on web (`import-sheet.tsx`).
- BLE / rsvpnano: hidden via `IS_WEB` in library and settings.
- Onboarding has no native-only step (welcome, theme, reader mode, pagination, speed, books, sync).

Walk every Capacitor plugin import in `apps/capacitor/src` and confirm each call is either gated or has a working web implementation; fix any that throw or show dead UI.

## Leaving the app in standalone mode
In an installed PWA, `window.open(..., "_blank")` and `Browser.open` open Safari or an overlay, and `"_system"` behaves differently than on Android. Affected: feedback (`routes/tabs/settings/index.tsx`), website links (`openWebsite`), reader external links, dictionary attribution, book detail links. Decide per link whether it should open in Safari (external sites) or stay in the app (our own site pages), and make it consistent.

Out of scope: web replacements for native-only features.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every Capacitor plugin call in apps/capacitor/src is confirmed gated or web-capable; findings and fixes are listed in the task notes
- [ ] #2 pnpm e2e:app asserts BLE, read-aloud, volume keys, reminders and push entry points are absent on web, and a walk through library, reader, settings, social and import logs no unhandled errors
- [ ] #3 External links in standalone mode follow a documented rule (external sites in Safari, own pages in-app) and work on a real iPhone
- [ ] #4 The Android build shows all features as before
<!-- AC:END -->
