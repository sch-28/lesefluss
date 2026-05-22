---
id: TASK-138
title: 'rsvpnano firmware: BLE on/off toggle'
status: To Do
assignee: []
created_date: '2026-05-21 02:13'
updated_date: '2026-05-22 22:31'
labels: []
milestone: m-12
dependencies: []
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Originally tracked as TASK-131.5. Moved out of the TASK-131 parent because it requires non-trivial rsvpnano on-device settings UI work and was not blocking the feature-complete milestone.

Add a toggle to the rsvpnano on-device settings UI to enable/disable the BLE GATT service. Saves RAM and radio power when the user doesn't need phone sync.

Setting persists in NVS namespace "rsvp" alongside existing settings. WiFi toggle nearby is the model to follow.

When BLE is off, NimBLE stack is fully de-inited (not just advertising stopped) to free RAM.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Toggle visible in on-device settings UI and in /api/settings JSON
- [ ] #2 Toggling off de-inits NimBLE; toggling on re-inits it without firmware restart
- [ ] #3 Setting persists across reboot
- [ ] #4 Default value documented (recommend: off by default; user enables when pairing)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-22 status: not started. No `ble.enabled` / `kPrefBle` / bleEnabled pref or settings UI toggle in apps/rsvpnano/src. BleSyncManager::end() does call NimBLEDevice::deinit(true) (BleSyncManager.cpp:436), so the de-init primitive exists — needs a settings binding + UI toggle + persistence.
<!-- SECTION:NOTES:END -->
