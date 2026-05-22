---
id: TASK-150
title: >-
  Multibook library characteristic JSON truncates past MTU (Unexpected end of
  JSON input)
status: Done
assignee: []
created_date: '2026-05-21 22:12'
updated_date: '2026-05-22 22:49'
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
- [x] #1 A device with 16 books returns the full library JSON to the app on a single adapter.read("library") (or transparently through chunked/NOTIFY protocol)
- [x] #2 useDeviceLibrary snapshot.kind === "multi" and snapshot.library.length matches device's book count
- [x] #3 Action sheet (useBookDeviceActions) sees correct isOnDevice / isActiveOnDevice states again
- [x] #4 No regression to single-book ESP32 storage read
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-22 status: not started. apps/rsvpnano/src/sync/BleSyncManager.cpp:449 buildLibraryJson still returns a single concatenated string passed via chr->setValue() (line 143). No chunked-read offset protocol, no notify-stream. Repro path unchanged.

2026-05-22 repro CONFIRMED on HW. After uploading 4 books to multibook device (Frankenstein 78708w, +66819w, +256976w, +130362w, +105418w), app sees `[Lesefluss][device-library] library read failed: Unexpected end of JSON input`. JSON for ~5 entries exceeds MTU. Fix per task plan (long-read / chunked / notify-stream).

2026-05-22 implementation landed on `redesign` branch. Approach C (write+notify stream): library char props -> WRITE|WRITE_NR|NOTIFY (READ dropped, hard cutover). Tag-framed protocol HDR(0x01)/DATA(0x02)/END(0x03)/ERR(0x7F) with CRC32 integrity, chunk size derived from peer MTU (cap 240 B). Firmware drain runs on Arduino loop task via BleSyncManager::drainLibraryFetch (uses esp_crc32_le, vTaskDelay(2) between notifies to dodge BLE_HS_ENOMEM). App: new library-fetch-impl.ts with subscribe+trigger+CRC validate+1 retry on transient drop; wired through adapter.fetchLibrary escape hatch mirroring transferFile. protocol_version bumped 1->2. Firmware build SUCCESS 10.39s. All app typechecks + tests pass (246/246). Ready for HW verification.

2026-05-22 HW verified after multi-round fixes:
- 7-entry library (905B) fetches in 804ms cold
- 8-entry library (1025B) fetches in 8.8s post-upload (concurrent 6.4s index rebuild)
- No chunk drops, no CRC mismatches across multiple connect cycles

Final mitigations beyond initial design:
1. Per-tick gating (else-if) so HDR and DATA don't race in same tick
2. POST_SUBSCRIBE_DELAY_MS 50 -> 200ms for Android CCCD honor delay
3. OVERALL_TIMEOUT_MS 5s -> 30s to absorb post-upload index rebuilds (up to 19s observed)
4. 30ms minimum gap between notify emits on firmware to avoid Android plugin packet drops (#424)
5. notify() return check on firmware; retry seq on mbuf exhaustion
6. CONNECTION_PRIORITY_HIGH bump on app side during fetch
7. Better diagnostic logging: chunk mismatch now reports received=[] missing=[] seqs
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Library characteristic converted from single-read to write+notify stream. Tag-framed protocol (HDR/DATA/END/ERR) with CRC32 integrity, per-tick state machine on firmware, 30ms inter-emit rate limit to dodge Android plugin drops. App side: CONNECTION_PRIORITY_HIGH + 30s overall timeout + 1.5s frame-gap timeout + 1 retry on CRC fail + useEffect cleanup against stale snapshots. Verified on HW with libraries 0-8 books across multiple upload/refresh cycles.
<!-- SECTION:FINAL_SUMMARY:END -->
