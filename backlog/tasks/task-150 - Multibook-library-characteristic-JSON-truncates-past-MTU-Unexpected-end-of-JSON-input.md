---
id: TASK-150
title: >-
  Multibook library characteristic JSON truncates past MTU (Unexpected end of
  JSON input)
status: To Do
assignee: []
created_date: '2026-05-21 22:12'
labels: []
milestone: m-12
dependencies: []
priority: high
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reading the multibook `library` characteristic (`BleSyncManager::buildLibraryJson` in apps/rsvpnano/src/sync/BleSyncManager.cpp) fails on `JSON.parse` with `Unexpected end of JSON input` whenever the library has more than ~3 books.

Cause: the characteristic value is a JSON array `[{hash, title, author, words, progressWords, category}, …]` returned via `chr->setValue(buildLibraryJson().c_str())`. NimBLE caps a single ATT read at MTU - 3 = 514 bytes (assuming MTU 517). For ~8 books × ~120 bytes per entry, the JSON easily exceeds this and the BLE plugin only sees the truncated head.

Fix candidates:
1. **Long-read (ATT Read Blob).** NimBLE-Arduino supports it implicitly when the stored value is larger than MTU. Verify whether `@capacitor-community/bluetooth-le` triggers long-reads on Android/iOS. If yes: the existing setValue might already store the full string; the plugin may need a config flag.
2. **Chunked-read protocol.** Add a per-read state (cursor + remaining bytes) and have the app issue multiple reads with an offset directive. Less elegant but plugin-agnostic.
3. **NOTIFY-stream.** Convert the library characteristic to write + notify: app writes a "fetch library" request, firmware streams chunked notifications until "END:LIBRARY". Mirrors the file-transfer pattern.

Recommended: investigate (1) first. If the plugin doesn't long-read transparently, fall back to (3) so the protocol surface is consistent with file transfer.

Verification:
- Reproduce: connect to a multibook device with 8+ books, observe `library read failed: Unexpected end of JSON input` log + empty snapshot.
- After fix: snapshot.library.length === 8.
- Confirm action sheet (`useBookDeviceActions`) sees the correct `isOnDevice` / `isActiveOnDevice` states again — fixes the downstream "Upload" vs "Open on device" misclassification.

Acceptance:
- A device with 16 books returns the full library JSON to the app on a single `adapter.read("library")`.
- snapshot.kind === "multi" with all entries parsed.
- No regression to single-book ESP32 storage read.

References:
- apps/rsvpnano/src/sync/BleSyncManager.cpp::buildLibraryJson
- apps/capacitor/src/contexts/device-library-context.tsx (refresh)
- packages/ble-config/config-multibook.json (library char descriptor)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A device with 16 books returns the full library JSON to the app on a single adapter.read("library") (or transparently through chunked/NOTIFY protocol)
- [ ] #2 useDeviceLibrary snapshot.kind === "multi" and snapshot.library.length matches device's book count
- [ ] #3 Action sheet (useBookDeviceActions) sees correct isOnDevice / isActiveOnDevice states again
- [ ] #4 No regression to single-book ESP32 storage read
<!-- AC:END -->
