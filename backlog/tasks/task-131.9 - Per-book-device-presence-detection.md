---
id: TASK-131.9
title: Per-book device-presence detection
status: Done
assignee: []
created_date: '2026-05-20 17:59'
updated_date: '2026-05-21 01:43'
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
- [x] #1 `computeOnDeviceHash(bookId, category)` is pure, exported, and matches the device's FNV-1a result for the same SD path
- [x] #2 Device library is fetched once per connect and after each upload/delete, exposed to consumers via context
- [x] #3 `useBookDeviceState(bookId)` returns the four-field shape and updates when the underlying device library changes
- [x] #4 When disconnected from any device, the hook returns isReachable=false and consumers can suppress badges
- [x] #5 Existing single-book on-device detection (today derived from `book_hash` in storage char) still works; no regression
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Foundation for 131.10-14 landed.

- `services/devices/hash.ts`: pure `computeOnDeviceHash(bookId, category)` + `onDevicePath()` helpers. FNV-1a 32-bit matching the firmware's `RsvpDataStore::hashBookPath` algorithm by construction (same offset 0x811c9dc5 + prime 0x01000193 over UTF-8 bytes).
- Test coverage in `services/devices/__tests__/hash.test.ts`: 8-char-hex shape, per-category routing, determinism, regression value.
- `contexts/device-library-context.tsx`: new `DeviceLibraryProvider` + `useDeviceLibrary` exposing a tagged-union `snapshot` ({kind: 'multi'|'single'|'none'}) and a `refresh()` to re-pull after upload/delete.
- `useBookDeviceState(bookId)` co-located in the same file. Returns `{isReachable, isOnDevice, isActiveOnDevice, descriptorId}`. Tries both categories for multi-book lookup, collapses to single-book branch when connected to esp32, suppresses to disconnected default when no device.
- Provider tree updated (`providers.tsx`): `DeviceLibraryProvider` sits between `BLEProvider` and `BookSyncProvider`.
- MultiBookSync component refactored to read library + active hash from the new context instead of pulling them itself.
- Book transfer flow (`book-sync-context.tsx`) calls `refreshDeviceLibrary()` after a successful multi-book upload so badges + library pickers update immediately.

203/203 tests pass. tsc clean. Pre-existing reader diagnostics from the in-flight word-index refactor are unrelated.
<!-- SECTION:FINAL_SUMMARY:END -->
