---
id: TASK-131.5
title: 'rsvpnano settings UI: BLE on/off toggle'
status: Done
assignee: []
created_date: '2026-05-20 22:19'
updated_date: '2026-05-21 22:20'
labels: []
milestone: m-12
dependencies: []
parent_task_id: TASK-131
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a toggle to the rsvpnano on-device settings UI to enable/disable the BLE GATT service. Saves RAM and radio power when the user doesn't need phone sync.

Setting persists in NVS namespace "rsvp" alongside existing settings. Wifi toggle nearby is the model to follow (web/library.js handles UI for /api/settings, on-device renderer in src/app/ for the device-side settings screen).

When BLE is off, NimBLE stack is fully de-inited (not just advertising stopped) to free RAM.

Depends on task-131.3 (NimBLE service implementation).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Toggle visible in on-device settings UI and in /api/settings JSON
- [ ] #2 Toggling off de-inits NimBLE; toggling on re-inits it without firmware restart
- [ ] #3 Setting persists across reboot
- [ ] #4 Default value documented (recommend: off by default; user enables when pairing)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved out of TASK-131 to TASK-138. The on-device BLE toggle is non-blocking polish that needs significant rsvpnano UI work, deferred indefinitely.
<!-- SECTION:FINAL_SUMMARY:END -->
