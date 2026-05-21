---
id: TASK-131.13
title: Settings sync routed through descriptor adapter
status: Done
assignee: []
created_date: '2026-05-20 18:00'
updated_date: '2026-05-21 22:20'
labels: []
milestone: m-12
dependencies: []
parent_task_id: TASK-131
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today's "Sync to device" / "Load from device" buttons in the device settings page call the old single-book `ble.readSettings` / `ble.writeSettings` regardless of connected device. On multi-book that fails silently or sends the wrong shape.

Per D7 + D8: keep the buttons visible for both device kinds, but route the call through the new transport adapter when connected to a multi-book device. The rsvpnano firmware currently stubs its settings characteristic and returns an error envelope; surfacing that error in a toast is acceptable for v1.

Implementation:
- In BleContext (or directly in the settings page), branch on `connectedDescriptorId`:
  - Single-book: existing path.
  - Multi-book: instantiate the multi-book adapter and call `adapter.read("settings")` / `adapter.write("settings", patch)`.
- Translate adapter `BLEResult.error` into the existing toast / error-state UI.
- No attempt at lesefluss-shape ↔ rsvpnano-shape mapping yet; the multi-book settings JSON shape mapping is part of the deferred TASK-131.3 follow-up (settings port + CompanionSyncManager refactor).

Out of scope:
- Real rsvpnano settings JSON port on firmware (handled by 131.3 follow-up).
- Hiding settings buttons for multi-book (D7 explicitly opted out).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Settings sync buttons remain visible when connected to either device kind
- [x] #2 Single-book settings sync behavior is unchanged (no regression)
- [x] #3 Multi-book settings sync goes through `multiBookAdapter.read/write('settings', ...)` and surfaces any error in the existing toast UI
- [x] #4 When the firmware returns its stub error envelope, the toast shows a sensible message
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
`syncToDevice` and `syncFromDevice` in BleContext now branch on `connectedDescriptorId`:

- Single-book esp32: existing `ble.writeSettings` / `ble.readSettings` path, unchanged behavior.
- Multi-book rsvpnano: instantiates the multi-book adapter and calls `adapter.write("settings", patch)` / `adapter.read("settings")`. The stub firmware returns `{ok:false, error:"settings not yet wired"}`; that error string is surfaced verbatim through the existing `setError` channel (toast on the device settings page).

For the multi-book path the lesefluss `RSVPSettings` shape is sent as-is; the lesefluss ↔ rsvpnano shape mapping lands with TASK-131.3 follow-up. Until then the read path special-cases `envelope.ok === false` to surface the firmware's error message; a future success envelope will populate the partial settings merge as before.

Settings sync buttons in the device settings page stay visible for both device kinds (D7). 203 tests + tsc green.
<!-- SECTION:FINAL_SUMMARY:END -->
