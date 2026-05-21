---
id: TASK-131.12
title: Remove-from-device flow (multi-book delete char + app action)
status: Done
assignee: []
created_date: '2026-05-20 18:00'
updated_date: '2026-05-21 22:20'
labels: []
milestone: m-12
dependencies: []
parent_task_id: TASK-131
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a way to delete a book from the rsvpnano device, used by the new "Remove from device" action in TASK-131.11.

Firmware (apps/rsvpnano, lesefluss-ble branch):
- New `delete` characteristic on the multibook GATT service. Access: Write. Payload: JSON `{hash}`.
- `RsvpDataStore::deleteBook(hash) -> bool`:
  - Resolve the SD path via `resolvePathByHash`.
  - `SD_MMC.remove(path)`.
  - Remove the NVS position + word-count keys (`p<8hex>`, `c<8hex>`).
  - Returns false if hash unknown or remove failed.
- BleSyncManager wires the write callback (running on Arduino loop task via the existing pending-flag pattern from TASK-131.3 v1 SD-off-host-task fix, so SD operations stay off the NimBLE host task).
- Notify is not strictly required for delete; app can re-read library afterward to confirm.

Schema (packages/ble-config):
- Add `delete` to multibook `config-multibook.json` characteristics with a fresh v4 UUID + description.
- Regenerate `ble_config.h` (covers the firmware side).
- Add to `multibook.ts` chars + descriptor in `services/devices/multi-book/descriptor.ts` with appropriate codec.

App:
- After delete: re-read device library, refresh `useBookDeviceState`, and clear app-side `activeBookId` only if the deleted book matched.
- If the deleted book was the device's active book: device firmware can clear or leave its `active` NVS key pointing at the now-missing hash; the next reader open will fail gracefully. App should also write a fresh `active` to "" (or skip if firmware tolerates dangling).

Out of scope:
- Bulk delete UI.
- Undo / trash.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Multibook schema includes a `delete` characteristic with a fresh v4 UUID and the C++ header regenerated
- [x] #2 Firmware `delete` callback runs SD remove + NVS cleanup on the Arduino loop task (not the NimBLE host task) and is idempotent for unknown hashes
- [x] #3 App-side action triggers the delete and refreshes the device library state
- [x] #4 Deleting the currently-active book on the device leaves the device in a safe state (no crash, app's view of `active` updates)
- [x] #5 Library badge for the deleted book disappears immediately after the action completes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delete characteristic added end-to-end.

Schema:
- `packages/ble-config/config-multibook.json`: new `delete` char with fresh v4 UUID (`fd6d4fe1-2269-469b-8917-3f152961e902`), description "Write-only delete request JSON: {hash}".
- `packages/ble-config/scripts/generate-cpp.ts`: emits `DELETE_CHAR_UUID` constant.
- `packages/ble-config/multibook.ts`: new `MultibookDeleteRequest` payload type.
- `apps/rsvpnano/src/ble/ble_config.h`: regenerated.
- `apps/capacitor/src/services/devices/multi-book/descriptor.ts`: `MultiBookDeleteRequest` type + `delete` char in descriptor with `W+N` access and JSON codec.

Firmware (apps/rsvpnano, lesefluss-ble branch):
- `RsvpDataStore::deleteBook(hash)`: resolve path, SD_MMC.remove, clear `p<hash>` + `c<hash>` NVS keys, clear `active` key when the deleted hash matches. Idempotent for unknown hashes (returns false but no crash).
- `BleSyncManager`: new `deleteChar_` characteristic + `BleDeleteCallbacks` handler. Callback captures the hash into pending state; `update()` drains on the Arduino loop task, keeping SD remove off the NimBLE host task (same pattern as the existing upload state machine).

App:
- MultiBookSync library list now renders a trash-icon button next to each book row. Tap → window.confirm → `adapter.write("delete", {hash})` → `refreshDeviceLibrary()`. Library + active state update immediately. Action-sheet entry in 131.14 will reuse the same adapter call.

Firmware build green (RAM 24.8%, flash 39.6%). App tsc + 203 tests pass. Hardware delete needs user verification.
<!-- SECTION:FINAL_SUMMARY:END -->
