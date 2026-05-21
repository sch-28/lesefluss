---
id: TASK-131.4
title: BLE transport seam + per-device descriptors + dispatch
status: Done
assignee: []
created_date: '2026-05-20 22:19'
updated_date: '2026-05-21 22:21'
labels: []
milestone: m-12
dependencies: []
parent_task_id: TASK-131
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build a descriptor-driven BLE transport in the capacitor app. Both devices (single-book esp32, multi-book rsvpnano) become thin descriptors over one transport — not two parallel adapter folders.

Folder layout:
- services/ble-transport/ — generic transport (chunked transfer + ACK queue + connection lifecycle + JSON-codec wiring). One implementation, two consumers.
- services/devices/single-book/ — descriptor for our esp32 (uses existing ble-config SERVICE_UUID + char UUIDs).
- services/devices/multi-book/ — descriptor for rsvpnano (uses ble-config multibook namespace).
- services/devices/index.ts — descriptorId → descriptor registry; capability hook.

Transport interface (strawman):
- createBleAdapter(descriptor) → typed surface with one method per char (readFoo/writeFoo) + transferChunked when descriptor declares a transfer char.
- Codecs are JSON-layer: each char in the descriptor carries an encode/decode pair operating on the typed payload.
- Transfer header is a per-descriptor headerBuilder callback that returns the first chunk's framed bytes; chunking + ACK/NACK is identical across devices.
- Polling stays in adapter (or call site), not transport. Transport is request/response only.

Capabilities:
- Derived from descriptor (presence of "library", "active" chars implies multi-book). No separate capabilities object.
- useDeviceCapabilities() hook reads connected device's descriptor and returns derived flags.
- Saved-device record persists descriptorId (string handle into registry) plus a snapshot of derived caps for offline UI hints.

Dispatch:
- <DeviceSync caps={...}> thin wrapper component picks between <SingleBookSync> and <MultiBookSync> based on caps. Routes mount <DeviceSync>, never the variants directly.

Existing services/ble/ does not get a parallel mirror — it gets migrated to use the transport (under services/devices/single-book/). Cleanup of old folder structure happens as part of this task.

Depends on task-131.1 (schema). Supersedes original 131.7 (shared-utils extraction is now structural, not deferred).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 services/ble-transport/ implements descriptor-driven adapter creation, with chunked transfer + ACK state machine living in one place
- [x] #2 Both single-book and multi-book descriptors live under services/devices/ and produce typed adapters via the transport
- [x] #3 useDeviceCapabilities() hook returns derived caps from the connected descriptor
- [x] #4 <DeviceSync> dispatch wrapper exists and renders <SingleBookSync> or <MultiBookSync> per caps
- [x] #5 Existing single-book functionality regresses zero: book transfer, position sync, settings, storage all still work on the esp32
- [x] #6 Saved-device record persists descriptorId; UI list view can render device label without connecting
- [x] #7 No services/ble-multibook/ folder is created; no parallel transfer.ts copies exist
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Transport seam landed: apps/capacitor/src/services/ble-transport/ (adapter.ts, codecs.ts, types.ts) + apps/capacitor/src/services/devices/{single-book,multi-book,capabilities,hash}. No services/ble-multibook/ parallel folder created. DeviceSync wrapper at components/device-sync/device-sync.tsx.
<!-- SECTION:FINAL_SUMMARY:END -->
