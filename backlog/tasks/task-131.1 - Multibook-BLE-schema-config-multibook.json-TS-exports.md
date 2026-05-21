---
id: TASK-131.1
title: 'Multibook BLE schema: config-multibook.json + TS exports'
status: Done
assignee: []
created_date: '2026-05-20 22:18'
updated_date: '2026-05-21 22:20'
labels: []
milestone: m-12
dependencies: []
parent_task_id: TASK-131
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Define the BLE GATT contract for rsvpnano (multi-book). Fresh UUIDs (random v4), separate file from existing single-book config to keep our ESP32 schema isolated.

Characteristics:
- info (R): {deviceName, fwVersion, protoVersion}
- library (R): JSON array [{hash, title, author, words, progressWords}]
- active (R/W): currently selected book hash (8-char hex, FNV-1a of SD path, matches rsvpnano's existing NVS key derivation)
- position (R/W): {hash, wordIndex}
- transfer (W + Notify): chunked book upload. Header frame carries {filename, category: "book"|"article", sizeBytes}. ACK/NACK notify framing reuses existing lesefluss pattern (transfer.ts:1-325) where practical.
- settings (R/W): rsvpnano settings JSON (reading/display/typography nesting, see web/library.js:225 in submodule)
- storage (R): {freeBytes, totalBytes, bookCount}

No notify chars beyond transfer ACKs. App polls position (2s) + library (5s) while relevant screens mounted.

Deliverables:
- packages/ble-config/config-multibook.json (sibling to config.json)
- packages/ble-config/multibook.ts exporting typed constants (mirrors index.ts shape)
- Re-export from packages/ble-config/index.ts under a `multibook` namespace so both can be imported
- Update generate-py.ts (or add generate-py-multibook.ts) — but only if/when rsvpnano firmware needs a generated header; for now C++ side can hand-write constants matching the JSON
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 config-multibook.json exists with fresh random v4 UUIDs for service + each characteristic
- [x] #2 TS exports importable as `import { multibook } from '@lesefluss/ble-config'`
- [x] #3 Existing single-book exports unchanged and untouched
- [x] #4 pnpm check-types passes in packages/ble-config
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Schema landed: packages/ble-config/config-multibook.json + multibook.ts namespace exporting MultibookLibraryEntry/Position/TransferHeader/etc. All 4 ACs covered per code inspection. Parent TASK-131 confirmed delivered.
<!-- SECTION:FINAL_SUMMARY:END -->
