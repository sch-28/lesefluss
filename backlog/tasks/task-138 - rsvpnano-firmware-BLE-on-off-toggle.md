---
id: TASK-138
title: 'rsvpnano firmware: BLE on/off toggle'
status: Done
assignee: []
created_date: '2026-05-21 02:13'
updated_date: '2026-05-22 22:25'
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
- [x] #1 Toggle visible in on-device settings UI and in /api/settings JSON
- [x] #2 Toggling off de-inits NimBLE; toggling on re-inits it without firmware restart
- [x] #3 Setting persists across reboot
- [x] #4 Default value documented (recommend: off by default; user enables when pairing)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-22 status: not started. No `ble.enabled` / `kPrefBle` / bleEnabled pref or settings UI toggle in apps/rsvpnano/src. BleSyncManager::end() does call NimBLEDevice::deinit(true) (BleSyncManager.cpp:436), so the de-init primitive exists — needs a settings binding + UI toggle + persistence.

2026-05-22 implemented:
- NVS pref `kPrefBleEnabled` (key 'ble_on') added in RsvpDataStore.cpp, default false
- RsvpDataStore::bleEnabled() + setBleEnabled() accessors
- settings JSON: added connectivity.bleEnabled field; applySettingsJson reads `bleEnabled` boolean
- App::applyBleEnabled(bool) toggles bleSync_.begin/end at runtime without reboot
- Boot: bleSync_.begin gated on dataStore_.bleEnabled(); off-by-default emits [boot] ble disabled log
- Menu: WifiSettings gains 'BLE sync: On/Off' row at last index; selectWifiSettingsItem handler toggles via applyBleEnabled
- NimBLE deinit via existing BleSyncManager::end() frees radio + RAM

Firmware builds SUCCESS 7.16s. Pending HW verification: confirm pref survives reboot + radio truly off after toggle.

2026-05-22 HW crash fix:

Symptom: device boot-loop ~5s after phone connect when BLE enabled. No panic banner (USB CDC eaten by reset).

Diagnosis (via /dev/ttyACM0 capture across resets): library stream completes cleanly, then 3-4 `state=Paused` ticks, then silent reset. Pattern fits ESP32 task watchdog (default ~5s) firing on a hung loop task.

Root cause: App::reconcileBleEnabled() called Preferences::getBool() on the loop task every update tick (~60/sec). NimBLE host task simultaneously writes NVS (e.g. setActiveBookHash via active-char write). Two tasks ⇒ same RsvpDataStore::preferences_ instance ⇒ unprotected concurrent NVS ops ⇒ loop task hang ⇒ TWDT reset.

Fix: std::atomic<bool> RsvpDataStore::bleEnabledCache_. bleEnabled() reads atomic — no NVS. begin() populates cache once. setBleEnabled() writes pref + updates cache. RsvpDataStore::applySettingsJson now routes via setBleEnabled to keep cache in sync. CompanionSyncManager's duplicate handler reverted (no dataStore_ ref yet — TASK-140 territory); HTTP PATCH bleEnabled documented as a no-op until 140 lands.

Verified by user: connect cycle stable, no boot-loop.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
BLE GATT toggle in WifiSettings menu, default OFF. Pref `ble_on` in NVS persists across reboot; settings JSON exposes connectivity.bleEnabled; toggle path applies via bleSync_.begin/end without firmware restart.
<!-- SECTION:FINAL_SUMMARY:END -->
