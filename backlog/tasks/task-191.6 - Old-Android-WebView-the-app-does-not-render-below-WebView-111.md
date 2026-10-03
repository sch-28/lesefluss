---
id: TASK-191.6
title: 'Old Android WebView: the app does not render below WebView 111'
status: To Do
assignee: []
created_date: '2026-10-03 16:00'
labels:
  - android
  - ereader
  - compatibility
dependencies: []
documentation:
  - apps/capacitor/src/index.html
  - apps/capacitor/vite.config.ts
  - apps/capacitor/src/services/telemetry/index.ts
parent_task_id: TASK-191
priority: high
ordinal: 146000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The goal of TASK-191 is that Lesefluss runs on every kind of e-reader, including cheap ones. The app's CSS is Tailwind v4, which needs a Chromium 111+ engine (cascade layers, oklch, color-mix, @property), and the JS bundle targets roughly the same. minSdk is 24, so the app installs on Android 7+ devices whose System WebView can be far older. Cheap e-readers (older Boox, Likebook, Meebook, PocketBook Android models) often ship WebView 70-100 and have no Play Store to update it. On those the app shows an unstyled or blank screen with no explanation.

Evidence so far: the Boox Nova Air 2 probed on 2026-10-03 has WebView 149 (Play Store present), so it is fine; it says nothing about low-end devices. Settings > Diagnostics already shows the WebView version and `services/telemetry` computes it, but telemetry does not send it yet (see TASK-191.4), so the share of affected installs is unknown.

Two parts, in this order:
1. Never fail silently. At boot, before the app's CSS and bundle matter, detect an engine that is too old (plain inline script and inline styles in `index.html`, no framework) and show a readable page: which WebView version was found, that 111 or newer is needed, and how to update "Android System WebView" (Play Store link, and a note for devices without Play Store). This must itself work on very old WebViews.
2. Decide whether to lower the floor. Evaluate a down-levelled build (Lightning CSS targets for colour and nesting fallbacks, a cascade-layers polyfill or flattened layers, a lower JS target) against the oldest WebView worth supporting, and what it costs in bundle size and maintenance. Record the decision; implement only if it is cheap enough.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On a WebView older than the supported floor the app shows a readable, self-contained notice naming the found and the required version and how to update, instead of a blank or unstyled screen
- [ ] #2 The notice works without the app's CSS framework or module scripts and is covered by a test that simulates an old engine
- [ ] #3 On supported WebViews nothing changes
- [ ] #4 A written decision exists on lowering the floor (which version, what it costs), with numbers from a real build; if adopted, the app renders correctly on that version
- [ ] #5 The supported WebView floor is documented where contributors and users can find it
<!-- AC:END -->
