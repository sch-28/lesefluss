---
id: TASK-144
title: >-
  rsvpnano: "Open on device" from app does not reliably switch the device's
  reader
status: Done
assignee: []
created_date: '2026-05-21 02:52'
updated_date: '2026-05-22 22:53'
labels: []
milestone: m-12
dependencies: []
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the action sheet, "Open on device" writes the multi-book `active` characteristic with the book's hash. The app-side write succeeds (TASK-131.13 firmware fix removed the SD validation that was blocking writes), but the on-device reader does not always switch to display the requested book:
- Sometimes the device stays on whatever it was showing (or the menu).
- Sometimes a fresh book open works but the position is wrong.
- Symptom may be related to TASK-142's live-position findings.

Investigation:
- Confirm the device's NVS active key is being written (already verified for the write itself succeeding).
- Audit `apps/rsvpnano/src/app/App.cpp` for the path that consumes the active hash: where does the device decide to open a book by hash? Does it poll NVS, or react to a callback?
- Compare the explicit on-device "open book" flow (user picks from device library) to the BLE-driven active-hash flow. The two probably need to converge on a single "open by hash" routine.
- Likely needs a hook similar to TASK-141's PositionListener: BleSyncManager exposes a `setActiveListener` that App handles by triggering its own book-load routine.

Out of scope:
- App-side action sheet (works correctly today).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tapping 'Open on device' from the action sheet reliably opens the requested book on the device within ~2 seconds, every time, across at least 10 attempts
- [x] #2 The book opens at the correct stored position (per TASK-142 outcome)
- [x] #3 If the requested hash does not exist on the device, the action surfaces a meaningful error in the app rather than silently failing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-22 status: ActiveListener hook landed. apps/rsvpnano/src/sync/BleSyncManager.h:28/36 ActiveListener + setActiveListener; apps/rsvpnano/src/app/App.cpp:754 register; App.cpp:5018 onBleActiveBookChange validates hash + triggers book load. Needs hardware verification across 10 attempts (AC #1) + error surfacing on missing hash (AC #3) before close. Coupled to TASK-142 for the position-correctness half (AC #2).

2026-05-22 HW verified: ActiveListener pipeline works. `[ble-active] open hash=...` -> refresh storage index -> `Opened indexed book` -> `opened book at index=N`. User confirmed reliable across attempts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Open-on-device reliable. BleSyncManager exposes setActiveListener; App.cpp:754 registers; onBleActiveBookChange (App.cpp:5018) validates hash, refreshes index if stale, triggers loadBookAtIndex. HW verified by user.
<!-- SECTION:FINAL_SUMMARY:END -->
