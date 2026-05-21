---
id: TASK-131.15
title: Multi-book per-book position sync
status: Done
assignee: []
created_date: '2026-05-21 01:32'
updated_date: '2026-05-21 02:02'
labels: []
dependencies:
  - TASK-131.9
  - TASK-135
parent_task_id: TASK-131
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wire per-book position sync between the app and a connected rsvpnano (multi-book) device. Previously deferred under D5/D6 because of byte↔word conversion complexity; ADR-0002 removed that complexity by making WordPosition the canonical app-side unit. The multibook descriptor's `position` characteristic already speaks `{hash, wordIndex}` with no conversion needed.

Read flow:
- On reader open for book X in the app, when connected to a multi-book device that has book X on disk (`useBookDeviceState(bookId).isOnDevice === true`):
  - `adapter.read("position")` returns `{hash, wordIndex}` for the device's currently-active book.
  - If the returned hash matches X's expected on-device hash: merge with `books.wordPosition` using max() (existing single-book conflict resolution pattern).
  - If the device's active book is NOT X (user opened a different book in-app while device shows another): no merge; the app uses its own position.

Write flow:
- While the in-app reader advances book X and the device is connected + book X is on device: push `adapter.write("position", {hash, wordIndex})` with the same throttling used for the single-book push.
- On multi-book upload (TASK-131.11): seed the device's per-book position with the app's current word position for that book in the same flow that writes the `active` char.

Implementation notes:
- Read the canonical `WordPosition` directly from `books.wordPosition`; no `WordIndex` build needed for the multi-book seam (no byte conversion).
- The descriptor type currently uses `wordIndex: number`. Tighten to `WordPosition` brand per ADR-0002 §27 ("Every position-bearing column, sync payload, and BLE descriptor consumes the brand").
- BookSyncContext branches by `connectedDescriptorId` exactly like the existing transfer path; reuse the single-book throttle helper.
- Per-book mapping: the app already computes `computeOnDeviceHash(bookId, category)` (TASK-131.9). Use it to derive the hash for writes; only write when the result matches the device's active hash (avoid clobbering whatever book the device is actually displaying).

Out of scope:
- Reading positions for books that are on the device but not currently active (would require N reads or a batch char — not in the schema).
- Background polling while the in-app reader is not open.

Depends on: TASK-131.9 (`useBookDeviceState` + hash computation), TASK-135 (reader and BookSyncContext both consume WordPosition).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening a book in-app while connected to a multi-book device that holds the same book reads the device position and merges with `books.wordPosition` using max()
- [x] #2 Advancing the in-app reader pushes throttled `adapter.write('position', {hash, wordIndex})` writes to the device
- [x] #3 Position writes are gated to the case where the device's active book matches the book the in-app reader is showing
- [x] #4 Multi-book upload (TASK-131.11) seeds the per-book position on the device alongside the active-book write
- [x] #5 Single-book position sync behavior is unchanged
- [x] #6 Multi-book descriptor's `wordIndex` field is typed as `WordPosition` (ADR-0002 §27), not raw `number`
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Multi-book per-book position sync wired end-to-end via the descriptor adapter; conversion-free thanks to ADR-0002's WordPosition canonical unit.

Descriptor:
- `MultiBookPosition.wordIndex` tightened from raw `number` to the `WordPosition` brand from `@lesefluss/core` (ADR-0002 §27).

Read flow (`syncPosition` in book-sync-context):
- Branches at top on `connectedDescriptorId`. For multi-book: `adapter.read("position")` returns `{hash, wordIndex}` for the device's currently-active book.
- Looks up which app book maps to that hash (tries both category hashes via `computeOnDeviceHash`).
- Max-merges with `books.wordPosition`: device ahead → write to DB; app ahead → push to device. Equal → no-op.
- No-op when the device's active book isn't in the app library.

Write flow (`pushPosition`):
- Signature changed to `pushPosition(bookId, position)` (`position` stays byte for single-book compat).
- Multi-book branch: reads fresh `book.wordPosition` from DB (savePosition writes it before pushing), gates the write to when the device's active hash matches one of the book's category hashes (avoids clobbering whatever the device is currently displaying), then `adapter.write("position", {hash, wordIndex: book.wordPosition})`.
- Reader (`pages/reader/index.tsx`) now calls `pushPosition(id, offset)`.

Upload seed (TASK-131.11 + 131.15 AC #4):
- After a multi-book transfer success the multibook branch writes the book's app-side `wordPosition` to the device's per-book position char (when > 0) alongside the existing `active` write. The on-device reader resumes at the in-app position.

Single-book sync behavior unchanged. tsc + 203 tests green.
<!-- SECTION:FINAL_SUMMARY:END -->
