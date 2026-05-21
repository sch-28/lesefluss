---
id: TASK-141
title: 'rsvpnano firmware: live position updates between app and reader'
status: To Do
assignee: []
created_date: '2026-05-21 02:41'
updated_date: '2026-05-21 02:51'
labels: []
dependencies: []
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today the multi-book position sync writes app-side word positions to the device's NVS successfully (confirmed by `[ble-pos] write ok=1` serial logs after each app reader advance). However the device's active reader holds its position in RAM and only consults NVS on book open. Two consequences:

1. **Live updates don't propagate** — when the user advances in-app while the book is open on the device, the device's display stays put. Acceptable for single-direction syncs (Kindle/Kobo model) but not what the user wants here.

2. **Device-side writes can clobber app writes** — when the user closes the book on the device, the reader appears to persist its current in-RAM word index (0 if not advanced) back to the same NVS key the app just wrote to. The reopen test fails to resume at the app's last position. Suspected cause; needs confirmation with serial trace during close.

Required:

- **Live BLE position writes update the in-RAM reader session.** When BLE position char is written and `hash == activeBookHash`, push the new word index into the active reader's state in addition to writing NVS.
- **Avoid race on device-side NVS write.** On reader close / advance, take max(in-RAM, NVS) before writing, OR have a single owner of the NVS key while the book is open.
- **(Optional) Notify app of device-side advances.** A position-notify subscription so the app's reader (if Frankenstein is open in-app while user reads on device) can mirror device advances. Out of scope for v1 if too invasive — the current pull-on-connect sync already covers the cold case.

Design sketch:

- Add an observer hook to `RsvpDataStore::writePosition`: when the written hash matches `activeBookHash`, fire a callback. BleSyncManager's begin() wires App's reader as the listener so it can seek to the new word index live.
- Audit the rsvpnano reader state machine (apps/rsvpnano/src/app/App.cpp + reader/ReadingLoop) for every site that persists position to NVS. Establish a single owner pattern so app-side writes aren't clobbered.

References:
- TASK-131.15 (per-book position sync — app side already complete)
- apps/rsvpnano/src/sync/BleSyncManager.cpp::applyPositionJson (current BLE write entry point)
- apps/rsvpnano/src/storage/RsvpDataStore.cpp::writePosition (current NVS write)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With the book open on the device, advancing the in-app reader causes the device's display to advance to the same word within ~1 second
- [ ] #2 Closing and reopening the book on the device after an app-side advance resumes at the app's last written word index (no clobber)
- [ ] #3 If position-notify is wired: app reader currently showing the same book mirrors device-side advances within ~2 seconds
- [ ] #4 No crash or stuck state when both app and device advance simultaneously (last-writer-wins is acceptable, but the connection must stay up)
- [ ] #5 Single-book esp32 position sync behavior unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-21: initial impl landed (setPositionListener + App::onBlePositionUpdate seek hook). Verified on hardware: behavior is inconsistent — seeks fire sometimes but device reader does not catch up reliably. Reopen-after-close still loses position. Subsumed into TASK-142 (live sync deep-dive) since the rsvpnano reader state machine needs a deeper audit than the listener-hook approach assumed.
<!-- SECTION:NOTES:END -->
