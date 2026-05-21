---
id: TASK-131.14
title: Adaptive book action sheet
status: Done
assignee: []
created_date: '2026-05-20 18:01'
updated_date: '2026-05-21 22:20'
labels: []
milestone: m-12
dependencies:
  - TASK-131.9
  - TASK-131.11
  - TASK-131.12
parent_task_id: TASK-131
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The book action sheet (long-press / hold on a library row) must adapt its device-related actions based on connected device kind + on-device state of that book.

Matrix:

- Disconnected (no device): hide all device actions.

- Single-book device (current behavior, preserve):
  - "Send to device" → opens existing TransferModal. Replaces device's one book.

- Multi-book device, book NOT on device:
  - "Upload to device" → opens TransferModal (category selector lives there, see TASK-131.11).

- Multi-book device, book on device, NOT currently active:
  - "Open on device" → writes the multibook `active` characteristic with the book's hash.
  - "Remove from device" → triggers delete flow (see TASK-131.12).

- Multi-book device, book on device, currently active:
  - Disabled / informational "Reading on device" row.
  - "Remove from device".

There is no "Replace" / "Re-upload" option (D0). To refresh, user deletes then uploads again.

Implementation:
- Look at existing `action-sheet.tsx` component / wherever the book hold options are rendered today.
- Read `connectedDescriptorId` + `useBookDeviceState(bookId)` to drive the option list.

Out of scope:
- Position sync wiring (deferred).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Disconnected from any device: device-related actions are hidden from the sheet
- [x] #2 Single-book device: existing 'Send to device' action present and functional, no behavior change
- [x] #3 Multi-book + not on device: only 'Upload to device' shown; opens upload modal
- [x] #4 Multi-book + on device + inactive: 'Open on device' and 'Remove from device' shown; 'Open' writes active char
- [x] #5 Multi-book + on device + active: 'Reading on device' visible as disabled state plus 'Remove from device' available
- [x] #6 No 'Replace' or 'Re-upload' option exists for any state
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
New hook `useBookDeviceActions({bookId, bookTitle, onUpload})` returns an `ActionSheetItem[]` shaped per device-kind + book-state matrix:

- No device connected OR bookId null: returns `[]` (callers spread unconditionally).
- Single-book esp32: `["Send to device" → onUpload]` (preserves existing flow).
- Multi-book rsvpnano + book NOT on device: `["Upload to device" → onUpload]`.
- Multi-book + on device + inactive: `["Open on device" (writes active char), "Remove from device" (writes delete char)]`.
- Multi-book + on device + active: `["Reading on device" (disabled), "Remove from device"]`.

No replace / re-upload option in any state (D0).

Multi-book actions:
- `openOnDevice`: tries both category hashes (`book`, `article`) and writes whichever the device accepts. Refreshes the device library on success.
- `removeFromDevice`: same hash candidates, writes to the `delete` characteristic (TASK-131.12). Refreshes.

Consumers:
- `pages/library/index.tsx`: hook drives the device portion of the action sheet, spread between "Details" and "Delete". `handleSetActive` renamed to `openUploadModal` to reflect what it actually does now.
- `pages/library/book-detail.tsx`: `secondaryActions` now come from the same hook, replacing the single hard-coded "Set active on device" button.

tsc + 203 tests green. Disconnected-state still renders "Details" and "Delete" only; device actions hidden by the hook returning empty.
<!-- SECTION:FINAL_SUMMARY:END -->
