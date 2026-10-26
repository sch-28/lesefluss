---
id: TASK-207
title: 'BLE position sync: revision ordering instead of furthest-wins'
status: To Do
assignee: []
created_date: '2026-10-26 03:15'
labels:
  - ble
  - sync
  - firmware
milestone: m-14
dependencies:
  - TASK-206
priority: low
ordinal: 181000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split out of TASK-206 (owner decision 2026-10-26). App and device positions merge as "furthest wins" (apps/capacitor/src/contexts/book-sync-context.tsx applyDevicePosition ~263, single-book syncPosition ~380-399), while cloud sync uses last-write-wins revisions. A deliberate backward jump in the app can be undone by a device notify still carrying an older, higher word, or by the next on-connect read. TASK-206 keeps furthest-wins but routes BLE through the position gate and documents the exception.

This task replaces furthest-wins with revision ordering (newest event wins). It needs a device-side revision/timestamp in the BLE protocol (firmware, packages/ble-config) and an app-side receive-time fallback for old firmware.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A backward jump in the app is not undone by a later device notify or connect read carrying an older position
- [ ] #2 Device reading newer than the app's last intent still moves the app forward
- [ ] #3 Old firmware without revisions keeps working (documented fallback)
<!-- AC:END -->
