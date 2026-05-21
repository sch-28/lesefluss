---
id: TASK-131.8
title: Normalize ble-config TS surface to camelCase
status: Done
assignee: []
created_date: '2026-05-20 23:13'
updated_date: '2026-05-21 02:13'
labels: []
dependencies: []
parent_task_id: TASK-131
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bring the ble-config TS surface to one casing convention: camelCase namespaces, no flat screaming-snake exports. JSON files stay as-is (single source of truth for codegen).

Today's mix:
- packages/ble-config/index.ts exports flat screaming-snake constants (SERVICE_UUID, POSITION_CHAR_UUID, CHUNK_SIZE, ...) plus the raw config default export.
- packages/ble-config/multibook.ts (TASK-131.1) exports a partially-normalized `multibook` namespace. Top-level transformed to camel; nested `characteristics` is raw JSON passthrough; the JSON `chunk_size_note` field is silently dropped.

Target:
- index.ts exports a `singleBook` namespace mirroring the shape of `multibook` (protocolVersion, deviceName, serviceUuid, characteristics: { settings, fileTransfer, position, storage }, transfer: { chunkSize, windowSize, maxRetries, ackTimeoutMs }).
- multibook.ts has full camelCase across the nested shape (no JSON `*_note` fields surface to TS).
- Flat screaming-snake exports removed.
- All 6 existing capacitor consumers (position.ts:10, client.ts:7, transfer.ts:28, settings.ts:11, storage.ts:9, progress-phases.tsx:1) migrate to the namespace.
- generate-py.ts and generate-cpp.ts unchanged (still read JSON directly).

Out of scope: changing the underlying JSON files; touching the esp32 MicroPython firmware.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/ble-config/index.ts exports a `singleBook` namespace with the same shape as `multibook`
- [ ] #2 All flat screaming-snake exports are removed (SERVICE_UUID, POSITION_CHAR_UUID, FILE_TRANSFER_CHAR_UUID, STORAGE_CHAR_UUID, SETTINGS_CHAR_UUID, CHUNK_SIZE, WINDOW_SIZE, MAX_RETRIES, ACK_TIMEOUT_MS, DEVICE_NAME, PROTOCOL_VERSION)
- [ ] #3 All capacitor consumers updated to import from the namespace
- [ ] #4 multibook.ts has no nested fields with snake_case keys; JSON-only fields like chunk_size_note do not surface
- [ ] #5 pnpm check-types passes across the monorepo
- [ ] #6 Existing ESP32 BLE flow still works end-to-end (single-book book transfer, position, settings, storage)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved out of TASK-131 to TASK-139. Pure TS-polish refactor, not required for the feature-complete milestone.
<!-- SECTION:FINAL_SUMMARY:END -->
