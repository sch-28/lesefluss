---
id: TASK-131.9
title: Per-book device-presence detection
status: To Do
assignee: []
created_date: '2026-05-20 17:59'
labels: []
dependencies: []
parent_task_id: TASK-131
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Foundation for the adaptive UX (TASK-131.10 onwards). The app needs to answer, for any lesefluss book id: is it on the connected device, and is it the device's currently-open book?

Hash mapping:
- The on-device filename convention is `{lesefluss-bookId}.rsvp`, placed under `/books/books/` (category=book) or `/books/articles/` (category=article).
- The device computes its book hash as FNV-1a (8-char lowercase hex) of the SD path.
- The app can compute the same hash deterministically, given the book id and category.
- Add a pure helper: `computeOnDeviceHash(bookId, category): string`.

Hook: `useBookDeviceState(bookId)`:
- When connected to a multi-book device: reads `adapter.read("library")` + `adapter.read("active")`, intersects with the computed hashes for the requested book (tries both categories), returns `{ isReachable, isOnDevice, isActiveOnDevice, descriptorId }`.
- When connected to a single-book device: derives from existing `ble.readStorage().book_hash` matching the bookId.
- When disconnected: returns `{ isReachable: false, isOnDevice: false, isActiveOnDevice: false, descriptorId: null }` (badges suppressed).

Caching:
- Light memoization at the BookSyncContext (or a new DeviceLibraryContext): fetch device library once per connect + after every upload/delete, expose as a map. Consumers read from context, no per-row BLE call.

Out of scope:
- Persisting device-library snapshot across disconnects (D3 = connected-only badges).
- Multi-book position sync (deferred).

Depends on TASK-131.4 (transport + adapter) which has landed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `computeOnDeviceHash(bookId, category)` is pure, exported, and matches the device's FNV-1a result for the same SD path
- [ ] #2 Device library is fetched once per connect and after each upload/delete, exposed to consumers via context
- [ ] #3 `useBookDeviceState(bookId)` returns the four-field shape and updates when the underlying device library changes
- [ ] #4 When disconnected from any device, the hook returns isReachable=false and consumers can suppress badges
- [ ] #5 Existing single-book on-device detection (today derived from `book_hash` in storage char) still works; no regression
<!-- AC:END -->
