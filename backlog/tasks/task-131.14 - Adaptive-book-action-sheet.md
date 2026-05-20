---
id: TASK-131.14
title: Adaptive book action sheet
status: To Do
assignee: []
created_date: '2026-05-20 18:01'
labels: []
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
- [ ] #1 Disconnected from any device: device-related actions are hidden from the sheet
- [ ] #2 Single-book device: existing 'Send to device' action present and functional, no behavior change
- [ ] #3 Multi-book + not on device: only 'Upload to device' shown; opens upload modal
- [ ] #4 Multi-book + on device + inactive: 'Open on device' and 'Remove from device' shown; 'Open' writes active char
- [ ] #5 Multi-book + on device + active: 'Reading on device' visible as disabled state plus 'Remove from device' available
- [ ] #6 No 'Replace' or 'Re-upload' option exists for any state
<!-- AC:END -->
