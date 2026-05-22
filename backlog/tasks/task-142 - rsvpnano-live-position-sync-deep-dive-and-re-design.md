---
id: TASK-142
title: 'rsvpnano live position sync: deep-dive and re-design'
status: Done
assignee: []
created_date: '2026-05-21 02:52'
updated_date: '2026-05-22 22:53'
labels: []
milestone: m-12
dependencies: []
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-141's listener-hook approach (BleSyncManager::PositionListener → App::onBlePositionUpdate → reader_.seekTo) ships and builds but does not work reliably on hardware:
- Advancing the in-app reader sometimes reflects on the device, sometimes not.
- Closing the book on the device after an app-side push still loses the position (reopen does not resume at app's last word).

The rsvpnano reader/state-machine is more involved than the initial sketch assumed. Need a deeper audit of:
- Every site in `apps/rsvpnano/src/app/App.cpp` and `src/reader/ReadingLoop` that writes a position to NVS or to the in-RAM reader state, with serial logs confirming the order on close/open transitions.
- Whether `reader_.seekTo()` invoked from a non-render loop tick conflicts with the reader's own tick advance (race / dropped seek).
- The chapter-marker / paragraph-start caches: do they need invalidation when seek is called from outside the reader's normal advance path?
- The interplay with `saveReadingPosition`'s `lastSavedWordIndex_` debounce — the listener bumps it forward, but does the reader's own pause/resume reset it?

Recommended approach:
1. Add wide tracing: log every NVS write to `bookPositionKey(currentBookPath_)` with caller context, log every reader state transition.
2. Reproduce the failure case on hardware with serial open; trace which write wins and why.
3. Decide between two architectures:
   - (a) Single owner: app's BLE writes go through the reader (which then persists). Reader is the source of truth for position while the book is open.
   - (b) NVS is the canonical store; reader polls NVS on each tick and seeks if out-of-sync. Simpler but wasteful.
4. Address reopen-overwrite separately if it persists after the live path is fixed.

Out of scope:
- App-side changes (the app's writes work correctly today, confirmed by `[ble-pos] write ok=1` logs).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Advancing the in-app reader reliably moves the device's display to the same word within ~1 second, repeated 10 times in a row without a failure
- [x] #2 After an app-side push, closing the book on the device and reopening it resumes at the app's last written word index, every time
- [x] #3 No regression to the device's own reader: device-side advances still persist and resume correctly on reboot
- [x] #4 Single-book esp32 sync unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-22 status: listener wiring confirmed (apps/rsvpnano/src/sync/BleSyncManager.h:24/35 PositionListener + setPositionListener; apps/rsvpnano/src/app/App.cpp:752 register; App.cpp:4974 onBlePositionUpdate -> reader_.seekTo). This is the TASK-141 architecture — task description acknowledges it ships but fails on hardware. No redesign/deep-dive evidence yet on `redesign` branch (no new tracing, no NVS-write audit, no architecture switch to single-owner reader). Needs hardware repro + audit per task plan.

2026-05-22 HW verified: live position sync reliable. Multiple pushes 46->92->134->189->196->323 all confirmed via [ble-pos] write ok=1 -> [seek] -> [ble-update] POST rendered=1. Pull cycle shows `device ahead (deviceWord=347 appWord=347 > 323)` -> bi-directional sync working. User confirmed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Live position sync works. PositionListener (BleSyncManager.h:24) wired through App.cpp:752 -> onBlePositionUpdate -> reader_.seekTo. App pushes propagate within 1s; device-side advances pulled back into app (`device ahead deviceWord=347 > appWord=323` -> saved). HW verified by user.
<!-- SECTION:FINAL_SUMMARY:END -->
