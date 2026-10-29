---
id: TASK-222
title: >-
  Read-aloud: swiping the app away leaves an orphaned voice (position not saved,
  no reattach)
status: Done
assignee: []
created_date: '2026-10-29 00:25'
updated_date: '2026-10-29 00:48'
labels: []
milestone: m-13
dependencies: []
priority: high
ordinal: 199000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Release review 2026-10-29, confirmed on Pixel: after removing the task from recents, TtsService keeps speaking; DB position stays put (progress lost); reopening shows library, voice not reattached; reviewer: needMore has no listener so it stalls after the 300-segment batch with the notification stuck. TtsPlugin.handleOnDestroy only clears the listener; TtsService has no onTaskRemoved.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Removing the task from recents stops read-aloud: no PLAYING media session, no TtsService, no app audio
- [x] #2 Saved position is no older than the last JS save before removal (no orphaned voice past it)
- [x] #3 Reopening after removal starts cleanly with no orphaned voice
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TtsService.onTaskRemoved stops the player (REASON_STOPPED); TtsPlugin.handleOnDestroy also stops it when the activity isFinishing (covers exitApp and the case where the foreground service was refused and onTaskRemoved never fires). A non-finishing destroy keeps the voice. Position: no native persistence; JS kept running in the background on the Pixel and use-read-aloud's 2 s throttled onWord save wrote the spoken word up to ~2 s before removal (DB word 2259 at 01:32:42, task removed 01:32:44), plus the reader's Capacitor pause flush on app switch. Residual: if the WebView was frozen for a long screen-off stretch, progress since the last JS save is lost on swipe (same as before, but the voice no longer runs on past it). Verified on Pixel 8 Pro: after swipe media_session PAUSED/active=false, no TtsService record, no AudioTrack for the app pid; relaunch lands on the library, no voice.

Review round 1: TtsPlayer is built on the main thread again (TtsPlugin.load); only the engine bind is lazy (first play()/whenReady()). MediaSession callback and AudioFocusRequest listener get an explicit main-looper Handler, since the CapacitorPlugins looper is quit in Bridge.onDestroy while the singleton lives on. handleOnDestroy now stops on every destroy (recreate, Don't keep activities), but only if clearListener reports this plugin was still the listener, so a late destroy of an old activity cannot stop a newer one. Device: Listen, swipe from recents, reopen in the same process (pid 11586), Listen, then KEYCODE_MEDIA_PAUSE/PLAY/PAUSE toggled media_session PAUSED/PLAYING/PAUSED. A recreate via font_scale 1.1 while listening stopped playback (PAUSED, active=false, no TtsService, no app audio); font_scale put back to 1.0. Residual: on API 24-25 the legacy requestAudioFocus(listener,...) has no Handler overload.

Planner verification (2026-10-29): 3 reviewers (threading, lifecycle, regressions) + 1 verifier, 1 fix round. The round-1 HIGH (MediaSession callbacks bound to the Capacitor plugin thread by lazy construction) is fixed by main-thread construction plus explicit main handlers. All 5 items verified FIXED; compile clean; device-verified on the Pixel (swipe-away stop, media keys after reopen, stop on recreate). Remaining LOWs: onEngineInit has no isShutDown check (microsecond window before kill); a font-scale/RTL recreate stops the voice (fontScale not in configChanges).
<!-- SECTION:NOTES:END -->
