---
id: TASK-131.3
title: 'rsvpnano firmware: NimBLE GATT service for multibook schema'
status: To Do
assignee: []
created_date: '2026-05-20 22:19'
labels: []
dependencies: []
parent_task_id: TASK-131
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a NimBLE-based GATT server to the rsvpnano firmware implementing the multibook BLE schema. Work happens on submodule fork branch lesefluss-ble.

Reuse rsvpnano's existing book store + NVS progress code (currently exposed via HTTP in src/sync/CompanionSyncManager.cpp). The BLE service is a second front-end onto the same data, not a parallel implementation.

Key files to study:
- apps/rsvpnano/src/sync/CompanionSyncManager.cpp (HTTP analog of every char we need)
- apps/rsvpnano/src/storage/IndexedBookStore.{h,cpp} (book listing, word index)
- apps/rsvpnano/platformio.ini (add NimBLE dep, may need partition table change)

ESP32-S3 supports BLE+WiFi coexistence natively; firmware can run both stacks. Adding BLE costs ~80kB RAM + flash for NimBLE.

Chunked transfer state machine on the device side mirrors lesefluss esp32 ble book transfer (apps/esp32/src/ble/file_transfer.py for reference behavior).

Position read/write uses word index (matches existing NVS encoding p%08x). Book hash = FNV-1a of SD path, identical to existing computeBookHash in CompanionSyncManager.cpp:1578-1597.

Depends on task-131.1 (BLE schema).

Deferred to later task: settings UI toggle for BLE on/off.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 NimBLE service advertises with the service UUID from packages/ble-config/config-multibook.json
- [ ] #2 All 7 characteristics (info, library, active, position, transfer, settings, storage) implemented and readable/writable per schema
- [ ] #3 Book uploaded via BLE transfer chr ends up in /books/books or /books/articles based on category, identical end state to HTTP upload
- [ ] #4 Position written via BLE updates same NVS key that HTTP/on-device reader uses (no divergent storage)
- [ ] #5 Firmware still builds and existing WiFi-AP HTTP sync remains functional
- [ ] #6 Branch lesefluss-ble on fork has a clean commit history suitable for eventual upstream PR
<!-- AC:END -->
