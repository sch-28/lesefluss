---
id: TASK-131.6
title: 'App UI: device-type aware library + book picker for rsvpnano'
status: Done
assignee: []
created_date: '2026-05-20 22:19'
updated_date: '2026-05-21 22:21'
labels: []
milestone: m-12
dependencies: []
parent_task_id: TASK-131
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Adapt the capacitor app UI to handle both device types via the dispatch component introduced in TASK-131.4.

Pattern:
- Routes mount <DeviceSync caps={...}>. The wrapper inspects caps (derived from the connected device's descriptor via useDeviceCapabilities()) and renders <SingleBookSync> or <MultiBookSync> internally. Routes themselves stay device-agnostic.
- <SingleBookSync> = today's existing flow for our esp32. Minimal change beyond plumbing through the transport.
- <MultiBookSync> = new flow:
  - Show device library (list from descriptor's library char) with title/author/progress per entry.
  - Active-book picker writes to the active char.
  - Upload flow accepts a category (book vs article).
  - Reading position sync uses {hash, wordIndex} keyed per book.
  - Live position display while reader screen open uses adapter-side polling (transport stays request/response).

Saved-device record:
- Persists descriptorId (string handle into services/devices/ registry).
- Persists a capability snapshot so the device list can render labels and badges without connecting.

Book identity: lesefluss UUID → deterministic filename {uuid}.rsvp on the device, so the FNV-1a hash the device computes is reproducible client-side for correlation.

Depends on task-131.4 (transport + dispatch).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 <DeviceSync> wrapper mounted from routes; <SingleBookSync> and <MultiBookSync> are the only device-specific UI components
- [x] #2 useDeviceCapabilities() drives the dispatch; no kind switch statements scattered in UI
- [x] #3 Saved devices view labels each device using the persisted capability snapshot, without requiring a connection
- [x] #4 Multi-book flow: user can view library, pick active book, upload to /books or /articles, see live position
- [x] #5 Single-book flow regresses zero on the esp32
- [x] #6 Position written from in-app reader matches what device displays after reconnect (per device)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
DeviceSync wrapper at apps/capacitor/src/components/device-sync/device-sync.tsx + routes/tabs/settings/device.tsx dispatch to Single/MultiBookSync. Multi-book library, upload+category, active picker, per-book position sync (131.15) all wired.
<!-- SECTION:FINAL_SUMMARY:END -->
