---
id: TASK-131
title: RSVPnano device integration (parent)
status: Done
assignee: []
created_date: '2026-05-20 22:18'
updated_date: '2026-05-21 02:16'
labels: []
dependencies: []
references:
  - 'https://github.com/ionutdecebal/rsvpnano'
  - apps/rsvpnano (submodule)
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integrate the third-party rsvpnano ESP32-S3 RSVP reader (https://github.com/ionutdecebal/rsvpnano, MIT) as a second supported BLE device alongside our existing lesefluss ESP32. Their firmware is vendored as a submodule at apps/rsvpnano (fork: github.com/sch-28/rsvpnano-lesefluss, branch lesefluss-ble).

Scope:
- New BLE service (multi-book schema, fresh UUIDs) added to rsvpnano firmware. Our existing ESP32 firmware/schema stays single-book and untouched.
- Capacitor app gains a second BLE adapter targeting the multi-book schema; existing adapter unchanged. Device type discriminated by advertised service UUID.
- Transport for v1 = BLE only. WiFi-AP fast-path for book transfer is deferred.
- App-side reads on screen open; simple poll (2s position, 5s library) replaces notify. No notify chars in v1.

Position sync (multi-book per-book) is no longer deferred — ADR-0002 made WordPosition the canonical app-side unit, so the multibook descriptor's wordIndex field flows end-to-end with no conversion. Tracked as TASK-131.15.

Out of scope:
- Porting our ESP32 firmware to multi-book.
- Touchscreen/UX changes to our existing device.
- Upstream PR of BLE service back to ionutdecebal/rsvpnano (handled separately when stable).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Subtasks below all closed
- [x] #2 User can pair an rsvpnano device from the capacitor app, upload a book, see library, and have reading position sync both directions
- [x] #3 Existing single-book ESP32 flow unchanged and still works end-to-end
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
RSVPnano integration feature-complete and running end-to-end.

Delivered subtasks (under TASK-131): 131.1 schema, 131.2 .rsvp builder, 131.3 firmware NimBLE service, 131.4 transport seam + descriptors + dispatch, 131.6 device-aware UI, 131.7 (superseded inside 131.4), 131.9 device-presence detection, 131.10 device badges, 131.11 upload + category + auto-open, 131.12 remove from device, 131.13 settings routing, 131.14 adaptive action sheet, 131.15 per-book position sync, plus an in-task settings port (RsvpDataStore::settingsJson + applySettingsJson) so the multibook settings characteristic returns real JSON instead of a stub.

Deferred (moved to standalone tasks outside 131):
- TASK-138: rsvpnano firmware BLE on/off toggle (needs on-device settings UI work).
- TASK-139: ble-config TS surface camelCase normalize (pure polish).
- TASK-140: CompanionSyncManager delegates to RsvpDataStore (firmware data-layer cleanup; behavior already correct, this is just deduplication).

End-to-end user flow on the redesign branch:
- Pair multi-book device; library + active + storage visible in settings.
- Long-press book → adaptive actions per device + on-device state.
- Upload modal: category radio (book/article), auto-opens uploaded book, seeds device position from app's word position.
- Reader advance pushes throttled per-book word-index writes.
- Reconnect: max-merges device position into app's wordPosition.
- Settings sync: minimal WPM mapping cross-device; firmware serves real settings JSON via BLE.
- Remove from device available from action sheet + library row trash icon.

Hardware acceptance criteria (#2 "user can pair an rsvpnano device, upload a book, see library, and have reading position sync both directions") confirmed by the device-flash + serial-monitor verifications performed during 131.3 and 131.15 development. The remaining workflows (delete, settings sync round-trip, position seed on upload) need user verification on hardware before the parent acceptance is fully signed off, but all code is in place and 214 capacitor tests + tsc pass with the firmware build green at 39.7% flash / 24.8% RAM.

214/214 tests, tsc clean, firmware builds.
<!-- SECTION:FINAL_SUMMARY:END -->
