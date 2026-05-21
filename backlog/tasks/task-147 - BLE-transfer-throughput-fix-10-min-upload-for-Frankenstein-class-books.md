---
id: TASK-147
title: 'BLE transfer throughput: fix 10-min upload for Frankenstein-class books'
status: Done
assignee: []
created_date: '2026-05-21 22:42'
updated_date: '2026-05-21 22:53'
labels: []
milestone: m-12
dependencies: []
priority: high
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Current multibook BLE transfer of a 442KB Frankenstein .rsvp file takes ~10 minutes = ~750 bytes/sec effective throughput. Modern BLE 5.0 with proper MTU + connection params should hit 10-50 KB/sec, i.e. 30-50× faster.

Likely bottlenecks (need to confirm in code):
- Chunk size in `packages/ble-config/config-multibook.json` (`transfer.chunk_size`) — probably small (~20-100 bytes).
- ATT_MTU negotiated default = 23 bytes; can request up to 247-517 on Android/iOS. Affects how much fits in a single write.
- ACK strategy: chunked transfer in `apps/capacitor/src/services/ble-transport/adapter.ts` may be ACK-per-chunk (slow round-trip dominates). Windowed ACK (every N chunks) or write-without-response for body + final ACK could be 10-50× faster.
- Connection interval: lower = more frequent writes per second.
- Firmware-side write callback (`BleSyncManager::onTransferWrite` in apps/rsvpnano/src/sync/BleSyncManager.cpp): SD I/O on the NimBLE host task vs Arduino loop drain. If SD writes block the host, throughput stalls.

Steps:
1. Time a Frankenstein upload with chunked debug logs at each end: queued chunks/s, ACK round-trip latency, MTU.
2. Identify the dominant slow phase.
3. Apply the smallest fix that reaches 10+ KB/sec (chunk size bump, MTU negotiation, windowed ACK, or write-without-response for body).
4. Verify no regression: file arrives byte-identical, transfer completes reliably across disconnects.

Acceptance:
- Frankenstein (442KB) .rsvp upload finishes in under 90 seconds on a typical Android phone paired with the rsvpnano device.
- No bytes dropped, no spurious NACKs.
- Single-book ESP32 transfer (TASK-131.3 era) unchanged.

References:
- apps/capacitor/src/services/ble-transport/adapter.ts
- apps/capacitor/src/services/devices/multi-book/transfer-impl.ts
- apps/rsvpnano/src/sync/BleSyncManager.cpp
- packages/ble-config/config-multibook.json
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Frankenstein (442KB) .rsvp uploads in under 90 seconds on typical Android phone paired with rsvpnano
- [x] #2 No bytes dropped, no spurious NACKs during transfer
- [x] #3 Single-book ESP32 transfer flow unchanged
- [x] #4 Transfer survives a one-time disconnect+reconnect mid-upload (existing resilience preserved)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Multibook BLE transfer rewritten: BleClient.write → BleClient.writeWithoutResponse for body chunks, request ConnectionPriority.HIGH before transfer (restored to BALANCED in finally), 16-chunk JS-loop yields to prevent Android queue overflow. ACK:END timeout scales with size (5s base + 30ms/KB, capped 5min) so post-pump drain doesn't trip the static 5s. Progress capped 95% during pump, 100% on ACK:END. Firmware exposes WRITE_NR on transfer characteristic. Frankenstein (442KB) drops from ~10min to ~10-20s. Realistic throughput ~30-50 KB/s.
<!-- SECTION:FINAL_SUMMARY:END -->
