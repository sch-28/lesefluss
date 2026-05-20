---
id: TASK-131.13
title: Settings sync routed through descriptor adapter
status: To Do
assignee: []
created_date: '2026-05-20 18:00'
labels: []
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
- [ ] #1 Settings sync buttons remain visible when connected to either device kind
- [ ] #2 Single-book settings sync behavior is unchanged (no regression)
- [ ] #3 Multi-book settings sync goes through `multiBookAdapter.read/write('settings', ...)` and surfaces any error in the existing toast UI
- [ ] #4 When the firmware returns its stub error envelope, the toast shows a sensible message
<!-- AC:END -->
