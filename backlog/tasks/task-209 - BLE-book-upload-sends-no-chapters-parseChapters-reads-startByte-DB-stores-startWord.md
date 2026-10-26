---
id: TASK-209
title: >-
  BLE book upload sends no chapters (parseChapters reads startByte, DB stores
  startWord)
status: To Do
assignee: []
created_date: '2026-10-26 03:15'
labels:
  - ble
  - bug
milestone: m-14
dependencies: []
priority: medium
ordinal: 182000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by lese-worker during TASK-206.3 (2026-10-26), not yet verified on hardware: apps/capacitor/src/contexts/book-sync-context.tsx `parseChapters` reads chapter entries as `{title, startByte}`, but the books table stores chapters as `{title, startWord}`. So uploads to the ESP32 reader carry 0 chapters. Verify against the stored chapter JSON and the device protocol (packages/ble-config, apps/esp32), fix the mapping (word vs byte units as the firmware expects), and add a unit test for the upload payload.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Confirmed (or refuted) against the stored chapter format and the firmware's expected units
- [ ] #2 BLE book upload includes the chapters in the units the firmware expects; unit test covers the payload
- [ ] #3 Checked on the device if available
<!-- AC:END -->
