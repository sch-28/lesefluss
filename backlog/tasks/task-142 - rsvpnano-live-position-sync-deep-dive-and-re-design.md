---
id: TASK-142
title: 'rsvpnano live position sync: deep-dive and re-design'
status: To Do
assignee: []
created_date: '2026-05-21 02:52'
labels: []
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
- [ ] #1 Advancing the in-app reader reliably moves the device's display to the same word within ~1 second, repeated 10 times in a row without a failure
- [ ] #2 After an app-side push, closing the book on the device and reopening it resumes at the app's last written word index, every time
- [ ] #3 No regression to the device's own reader: device-side advances still persist and resume correctly on reboot
- [ ] #4 Single-book esp32 sync unchanged
<!-- AC:END -->
