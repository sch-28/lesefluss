---
id: TASK-131.12
title: Remove-from-device flow (multi-book delete char + app action)
status: To Do
assignee: []
created_date: '2026-05-20 18:00'
labels: []
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
- [ ] #1 Multibook schema includes a `delete` characteristic with a fresh v4 UUID and the C++ header regenerated
- [ ] #2 Firmware `delete` callback runs SD remove + NVS cleanup on the Arduino loop task (not the NimBLE host task) and is idempotent for unknown hashes
- [ ] #3 App-side action triggers the delete and refreshes the device library state
- [ ] #4 Deleting the currently-active book on the device leaves the device in a safe state (no crash, app's view of `active` updates)
- [ ] #5 Library badge for the deleted book disappears immediately after the action completes
<!-- AC:END -->
