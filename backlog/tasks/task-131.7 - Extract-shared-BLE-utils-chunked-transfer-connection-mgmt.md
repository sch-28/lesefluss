---
id: TASK-131.7
title: Extract shared BLE utils (chunked transfer + connection mgmt)
status: Done
assignee: []
created_date: '2026-05-20 22:19'
updated_date: '2026-05-21 22:20'
labels: []
milestone: m-12
dependencies: []
parent_task_id: TASK-131
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After both adapters (services/ble and services/ble-multibook) are working, factor out the duplication. Specifically the chunked-transfer state machine in apps/capacitor/src/services/ble/characteristics/transfer.ts (325 LoC) and the BleClient connection lifecycle in services/ble/client.ts.

Target shape: services/ble-shared/ exporting:
- A generic transferFile({serviceUuid, charUuid, headerBuilder, payload, onProgress}) implementation
- bleClient connection mgmt (assertConnected, connect, disconnect)
- encoding helpers (already isolated in utils/encoding.ts; move into shared)
- BLEResult type

Both adapters become thin: characteristics define UUIDs + payload shapes, transfer/connection lifecycle is shared.

Do this AFTER the multibook adapter is working — premature abstraction is the larger risk. If duplication ends up trivial, this task can be closed as not needed.

Depends on task-131.4 (capacitor adapter).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 services/ble/ and services/ble-multibook/ both import their transfer impl from services/ble-shared/
- [ ] #2 Diff in functional behavior of existing ESP32 transfer is zero (regression check: book transfer still works end-to-end)
- [ ] #3 No new public surface beyond what existed before
- [ ] #4 OR: task closed with note explaining duplication did not warrant abstraction
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Superseded by the revised TASK-131.4. Architecture grilling (per the improve-codebase-architecture skill) concluded that the BLE transport should be descriptor-driven from day one rather than building two parallel adapters and consolidating after. The chunked transfer + ACK + connection lifecycle now live inside services/ble-transport/ from the start, with per-device descriptors under services/devices/. Extracting shared utils as a separate later step is therefore redundant.
<!-- SECTION:FINAL_SUMMARY:END -->
