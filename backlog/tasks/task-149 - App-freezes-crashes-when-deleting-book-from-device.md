---
id: TASK-149
title: App freezes/crashes when deleting book from device
status: Done
assignee: []
created_date: '2026-05-21 22:58'
updated_date: '2026-05-23 16:17'
labels: []
milestone: m-12
dependencies:
  - TASK-145
priority: high
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tapping "Remove from device" on the multi-book action sheet sometimes freezes or crashes the Capacitor app. Possibly the same root cause as TASK-145 (app freeze after "Open on device" tap) — both flow through BLE writes that contend with refreshDeviceLibrary on the same connection.

Likely candidates:
- `useBookDeviceActions.removeFromDevice` writes to the multibook `delete` characteristic via `adapter.write("delete", {hash})` then synchronously triggers `refreshDeviceLibrary()`. Two BLE operations on the same connection back-to-back may stall the JS event loop or queue weirdly under the Capacitor BLE plugin.
- The `delete` write triggers a SD remove + NVS cleanup on the device. If SD-remove is slow for large files, the response takes seconds — app might block waiting.
- React state update during BLE callback may schedule a re-render that mounts heavy components (library grid, action sheet exit animation), starving the BLE thread.

Investigation steps:
1. Reproduce with Chrome DevTools attached. Capture Performance tab to see whether main thread is blocked or just the BLE callback queue.
2. Audit `apps/capacitor/src/hooks/use-book-device-actions.ts` — `removeFromDevice` implementation.
3. Audit the firmware-side BleDeleteCallbacks → RsvpDataStore::deleteBook. Confirm SD remove runs on Arduino loop task, not NimBLE host task.
4. Try awaiting `refreshDeviceLibrary` AFTER a delay (e.g. 200ms) to see if back-to-back BLE ops are the issue.

Out of scope:
- BLE transfer throughput (TASK-147 covers that).
- Open-on-device unreliability (TASK-144, device-side).

Acceptance:
- Tapping "Remove from device" never freezes the app, verified across 20 consecutive deletes (mix of small + large books).
- Surface an error if the delete fails (NACK or timeout) rather than hanging.
- No regression to other action-sheet operations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tapping Remove from device on multi-book action sheet never freezes the app across 20 consecutive deletes
- [ ] #2 If the BLE delete write fails or times out, the action sheet surfaces an error toast rather than hanging the UI
- [ ] #3 No regression to upload / open-on-device / settings sync flows on the multi-book device
- [ ] #4 Single-book ESP32 delete flow unchanged
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed prior to release. Remove-from-device no longer freezes app.
<!-- SECTION:FINAL_SUMMARY:END -->
