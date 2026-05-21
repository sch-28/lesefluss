---
id: TASK-145
title: app freezes sometimes after tapping "Open on device"
status: To Do
assignee: []
created_date: '2026-05-21 02:52'
updated_date: '2026-05-21 22:18'
labels: []
milestone: m-12
dependencies: []
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Capacitor app (not device) freezes intermittently after the user taps "Open on device" from the book action sheet on a multi-book rsvpnano device.

Symptom: app UI stops responding (no further renders, touches don't register) after the action sheet fires. Sometimes recovers on its own, sometimes needs the app to be backgrounded + foregrounded.

The underlying BLE write to the multibook `active` characteristic appears to succeed (confirmed via serial logs on device side per TASK-144 investigation), so this is an app-side problem, not a firmware crash.

Investigation hypotheses:
- The `adapter.write("active", {hash})` call is awaited inside an event handler that also triggers a `refreshDeviceLibrary()` immediately after. If both happen on the same BLE connection without yielding, the BLE stack may stall the JS event loop.
- The action-sheet close + state update + adapter call may compete for the BLE lock. Look at the order in `useBookDeviceActions` (`apps/capacitor/src/pages/library/`) and the multi-book adapter's serialization.
- A pending React state update inside the adapter write callback could be triggering a synchronous re-render of a heavy component (book list).

Steps:
1. Reproduce locally with Chrome DevTools attached. Confirm whether the React render loop is blocked (Performance tab) or the JS event loop is starved (Long Tasks).
2. Check whether `refreshDeviceLibrary` is called inside a `Promise.all` with the active-char write, or serially. Either pattern has a different fix.
3. Audit `services/devices/multi-book/transfer-impl.ts` and `services/ble-transport/adapter.ts` for any synchronous blocking after a write completes.

Out of scope:
- Firmware behavior (TASK-144 handles the "did the device switch" half).
- Touch hardware on the rsvpnano (no device freeze involved).

Acceptance Criteria:
- Tapping "Open on device" from the action sheet never freezes the app, verified across 20 consecutive attempts with various book + connection states.
- If the BLE write fails, the action sheet surfaces an error rather than hanging.
- No regression to single-book ESP32 sync.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tapping 'Open on device' from the action sheet never freezes the app, verified across 20 consecutive attempts with various book + connection states
- [ ] #2 If the underlying BLE write fails, the action sheet surfaces an error toast rather than hanging the UI
- [ ] #3 No regression to single-book ESP32 sync
<!-- AC:END -->
