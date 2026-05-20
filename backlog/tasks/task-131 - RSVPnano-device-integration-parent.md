---
id: TASK-131
title: RSVPnano device integration (parent)
status: To Do
assignee: []
created_date: '2026-05-20 22:18'
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

Out of scope:
- Porting our ESP32 firmware to multi-book.
- Touchscreen/UX changes to our existing device.
- Upstream PR of BLE service back to ionutdecebal/rsvpnano (handled separately when stable).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Subtasks below all closed
- [ ] #2 User can pair an rsvpnano device from the capacitor app, upload a book, see library, and have reading position sync both directions
- [ ] #3 Existing single-book ESP32 flow unchanged and still works end-to-end
<!-- AC:END -->
