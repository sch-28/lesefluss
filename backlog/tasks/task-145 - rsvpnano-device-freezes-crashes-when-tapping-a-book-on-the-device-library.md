---
id: TASK-145
title: 'rsvpnano: device freezes / crashes when tapping a book on the device library'
status: To Do
assignee: []
created_date: '2026-05-21 02:52'
labels: []
dependencies: []
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported during TASK-131 hardware verification: opening a book from the rsvpnano's on-device library menu sometimes freezes the device (display does not update, no response to touch). May be a hard crash + reboot, may be a softer hang.

Repro steps to confirm:
- Boot fresh after a flash.
- Pair with the app (or don't — try both).
- On the device, navigate to the library menu, tap a book.
- Note whether the screen freezes, whether the device reboots, and whether serial output shows a panic backtrace.

Investigation:
- Capture serial output during the freeze. If a Guru Meditation backtrace appears, decode with `pio device monitor --filter esp32_exception_decoder` and identify the failing frame.
- Suspected interaction with the new BLE subsystem: if BLE is connected/advertising while the user taps the book, the heavy book-load path (SD reads, word-index build) may starve the NimBLE host task, or vice versa. Repro with BLE disabled (or unpair) to isolate.
- Audit `apps/rsvpnano/src/app/App.cpp::loadBookAtIndex` and the EPUB conversion path for any blocking operations that could trigger a watchdog reset under BLE load.

Out of scope:
- Touch hardware diagnostics — assume input layer works (it does, per the user's normal-mode reports).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Repro captured on serial with timestamp + backtrace (if any) attached to this task
- [ ] #2 Root cause identified — watchdog, memory corruption, BLE/Arduino-loop contention, SD I/O stall, etc.
- [ ] #3 Fix lands: tapping a book on the device library opens reliably without freeze across 20 consecutive attempts (both with and without active BLE connection)
- [ ] #4 If the issue is BLE-task interaction, the fix does not require disabling BLE; it makes the two coexist correctly
<!-- AC:END -->
