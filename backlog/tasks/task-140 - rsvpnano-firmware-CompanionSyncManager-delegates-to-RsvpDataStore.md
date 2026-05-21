---
id: TASK-140
title: 'rsvpnano firmware: CompanionSyncManager delegates to RsvpDataStore'
status: To Do
assignee: []
created_date: '2026-05-21 02:13'
updated_date: '2026-05-21 22:20'
labels: []
milestone: m-12
dependencies: []
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Long-tail cleanup that was originally a "follow-up" inside TASK-131.3. Moved to its own task because it's invasive (touches the entire 1623-LoC CompanionSyncManager) and not required for the feature-complete milestone.

Today the firmware has two implementations of the same data-layer invariants: CompanionSyncManager (HTTP path, uses its own private kPref* + preferences_) and RsvpDataStore (BLE path, holds the canonical helpers). They read/write the same NVS keys + SD layout but each has its own copy of the FNV-1a hasher, the position-key formatter, the .rsvp metadata reader, the settings JSON serializer, and the atomic upload commit.

The migration:
- Replace every internal preferences_.* and kPref* call inside CompanionSyncManager.cpp with dataStore_.* calls.
- CompanionSyncManager keeps its HTTP routing, request parsing, and statusLine bookkeeping; data access goes through the store.
- Remove the now-dead private kPref* constants + helper methods from CompanionSyncManager.
- After landing, only one implementation of the data invariants remains. Diverging behavior between transports becomes impossible by construction.

Out of scope:
- New features (those land in their own tasks).
- Reorganizing the HTTP handler routing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CompanionSyncManager.cpp contains no private kPref* constants, no private settingsJson / applySettingsJson / hashBookPath / bookPositionKey / bookWordCountKey / progressPercentForPath / readRsvpMetadata / sanitizeFilename / finishUpload definitions
- [ ] #2 All HTTP handlers in CompanionSyncManager call into dataStore_ for those concerns
- [ ] #3 RsvpDataStore continues to provide the same surface, no API regressions
- [ ] #4 Firmware builds and existing HTTP + BLE sync paths remain functional end-to-end
<!-- AC:END -->
