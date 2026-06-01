---
id: TASK-152
title: Fix deprecated edge-to-edge APIs for Android 15 (Play warning)
status: To Do
assignee: []
created_date: '2026-05-31 23:26'
labels:
  - android
  - dependencies
  - play-store
dependencies: []
priority: low
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Google Play flags deprecated edge-to-edge / window display APIs in Android 15 (API 35).

Deprecated APIs used:
- android.view.Window.getStatusBarColor / setStatusBarColor
- android.view.Window.getNavigationBarColor / setNavigationBarColor

All originate from dependencies, not app code:
- com.capacitorjs.plugins.statusbar.StatusBar (getStatusBarColorDeprecated / setStatusBarColorDeprecated) — Capacitor StatusBar plugin
- com.google.android.material.bottomsheet.BottomSheetDialog.onCreate / sidesheet.SheetDialog.onCreate / internal.EdgeToEdgeUtils.applyEdgeToEdge — Material Components
- io.ionic.libs.ioncameralib.view.IONCAMRImageEditorActivity.onCreate — Ionic camera plugin

Fix path: bump dependency versions that drop the deprecated calls (Capacitor StatusBar plugin, Material Components, camera plugin). Warning only — non-blocking until targetSdk=35 where setters become no-ops. No app-code patch expected.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No deprecated edge-to-edge / status bar / nav bar color APIs flagged by Google Play
- [ ] #2 Capacitor StatusBar, Material Components, and Ionic camera dependencies updated to versions without deprecated calls
- [ ] #3 Status bar and nav bar appearance verified on Android 15 device/emulator
<!-- AC:END -->
