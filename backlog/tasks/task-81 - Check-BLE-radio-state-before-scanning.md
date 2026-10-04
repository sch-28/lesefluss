---
id: TASK-81
title: Check BLE radio state before scanning
status: Done
assignee: []
created_date: '2026-04-26 15:59'
updated_date: '2026-10-04 01:07'
labels: []
milestone: m-13
dependencies: []
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prompt user / surface error if Bluetooth is off, instead of silent no-results.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Before every scan the app checks the Bluetooth radio state; with Bluetooth off, auto-scan pauses and the Device settings page shows a clear 'Bluetooth is turned off' message instead of an endless empty scan
- [x] #2 On Android, a user-initiated scan (Scan button or 'Turn on Bluetooth') opens the system enable-Bluetooth dialog; auto-scan never opens it on its own
- [x] #3 When Bluetooth is turned back on (system toggle or dialog), the scan resumes automatically without reopening the page
- [x] #4 On Android, scanning with location services off shows a 'Location is turned off' message with a button that opens location settings; returning to the app re-checks
- [x] #5 A denied Bluetooth permission at initialize shows a permission message with a button that opens app settings; returning to the app retries initialize
- [x] #6 Auto-scan waits for BLE initialize to succeed instead of racing it
- [x] #7 The check sits in the shared scan path, so ESP32 and rsvpnano devices are both covered; web build unchanged (BLE stays disabled there)
- [x] #8 Readiness logic is unit-tested (radio on/off, prompt accept/decline, iOS no prompt, location off, permission error mapping)
- [x] #9 A manual scan before BLE initialize succeeds (e.g. permission denied) leaves the permission-denied blocker in place, so returning from app settings still re-runs initialize; a failing readiness check keeps the previous blocker
- [x] #10 Scan/Restart buttons are hidden while a blocker is shown; the Bluetooth-off action is hidden where requestEnable is unavailable (iOS); BLEProvider blocker transitions covered by src/contexts/__tests__/ble-context.test.tsx
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation: new pure `checkScanReadiness` + `isPermissionDeniedError` + `SCAN_BLOCKER_MESSAGES` in apps/capacitor/src/services/ble/readiness.ts (tested in __tests__/readiness.test.ts). BLEClient gains checkScanReadiness(interactive), watchEnabled (startEnabledNotifications), openSettingsFor (location/app settings). ble-context: bleReady + initAttempt + scanBlocker state; auto-scan gated on bleReady && !scanBlocker and runs non-interactively; startScan (user) is interactive; enabled-notification listener clears/sets bluetooth-off; App 'resume' clears other blockers (and re-inits on permission-denied). Device settings page shows the blocker message + action button. Plugin facts (v8.1.3): isEnabled/requestEnable/isLocationEnabled/openLocationSettings are Android-only or no-ops on web; startEnabledNotifications does not emit the initial state on Android; init rejects 'Permission denied.' (Android) / 'BLE permission denied' (iOS). Location check runs on all Android versions because the plugin requests ACCESS_FINE_LOCATION and the manifest lacks neverForLocation (results are location-filtered). Needs on-device verification on Android (BT off/on, location off, permission denied).

Review fix: runScan returns early while !bleReady (previously its catch treated a rejected isEnabled as 'ready' and cleared the permission-denied blocker, removing the resume retry). A readiness-check error now keeps the previous blocker. Turning BLE off in the app resets bleReady. New context field canResolveScanBlocker (false for bluetooth-off when !bleClient.canRequestEnable). device.tsx hides Scan/Restart while a blocker is set. Added BLEProvider tests with a mocked bleClient (permission-denied + manual scan + resume, BT off -> on, check failure, iOS no-fix).

Lead verification 2026-10-02: independent review confirmed plugin usage and that location-off really blocks scan results (no neverForLocation in the merged manifest). Its one bug (a failed readiness check cleared the permission-denied blocker, leaving BLE stuck until restart) is fixed and covered by a new BLEProvider state test; 13/13 BLE tests pass. Remaining before Done: the Android device checks listed above, especially deny permission → tap Scan (no change) → grant in app settings → return → scan starts. Optional later: initialize with androidNeverForLocation + manifest neverForLocation so Android 12+ no longer needs location on.

2026-10-04: briefly closed, reopened. Code and unit tests are green, but the Android device checks listed above were never run (Bluetooth off then on, location off, permission denied then Scan then grant in app settings then return). The Boox was not connected when attempted.

Device check 2026-10-04, Boox Nova Air 2 (Android 11), debug build driven over CDP, system dialogs via uiautomator. Start state BT off, location off, location permission never granted, in-app BLE off; all restored afterwards. Turning in-app BLE on shows the location permission prompt; Deny -> 'Bluetooth permission was denied' + Open app settings, Scan/Restart hidden. Open app settings opens InstalledAppDetails; after granting and returning, initialize re-runs and the next blocker 'Bluetooth is turned off' + Turn on Bluetooth appears without any system dialog of its own. Turn on Bluetooth opens 'Lesefluss wants to turn on Bluetooth'; Allow -> 'Location is turned off' + Open location settings, which opens LocationSettingsActivity; location on and back -> 'Scanning for device...'. Bluetooth off in system settings while scanning -> 'Bluetooth is turned off' on return; on again -> scanning resumes on return. Not exercised: a system toggle flipped while the app stays in front (the Boox shade has no Bluetooth tile); that path is covered by the BLEProvider unit tests.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
BLE scans check readiness first: Bluetooth off, location off or permission denied each show a message with a fix-it action, auto-scan never opens a system dialog, and scanning resumes by itself once the cause is fixed. Unit-tested and verified on an Android 11 e-reader.
<!-- SECTION:FINAL_SUMMARY:END -->
