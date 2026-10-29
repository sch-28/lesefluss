---
id: TASK-224
title: Read-aloud dies when the WebView renderer is killed in the background
status: Done
assignee: []
created_date: '2026-10-29 00:25'
updated_date: '2026-10-29 00:48'
labels: []
milestone: m-13
dependencies: []
priority: high
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Release review 2026-10-29. MainActivity renderer-gone handler (~44-46) calls Process.killProcess when the activity is not resumed; with read-aloud playing (screen off, low RAM) this ends speech silently mid-sentence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Renderer death with read-aloud playing in the background ends playback cleanly (engine, media session, service) before the process exits
- [x] #2 Foreground renderer recovery unchanged apart from stopping read-aloud first
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Chose the clean stop over keeping the voice alive: a recreated WebView has no session attached to the player (no needMore listener, no position saves, listen-log intervals unmapped since sentSegments lives in the dead JS), i.e. the TASK-222 orphan. MainActivity.stopReadAloud() calls new TtsPlayer.shutdown() in both renderer-gone branches before killProcess/restartProcess: stop(REASON_STOPPED) with isServiceRequested cleared (so no SHUTDOWN intent races the kill), TtsService.stopIfRunning (stopService only once startForeground ran), mediaSession.release, tts.shutdown. Verified on Pixel: adb shell kill on the renderer is not permitted without root, so crashed it via CDP Page.navigate chrome://crash while listening with the app backgrounded; log 'WebView renderer gone (crashed: true)', process exited, no media session, no TtsService, no notification, no app audio. Ordering of stop vs kill not observable externally. Position progress since the last JS save is still lost on a renderer death (JS is gone).

Review round 1: MainActivity.stopReadAloud wraps shutdown in try/catch(RuntimeException) + Log.w so recovery always proceeds. shutdown() now sets isShutDown (checked by play, stop, bindEngine, requestService, publishState/publishMetadata, whenReady -> onReady(false)), clears isEngineReady and the static instance under the class lock, so plugin calls queued in the restartProcess gap cannot touch the released session or restart the service.

Planner verification (2026-10-29): 3 reviewers (threading, lifecycle, regressions) + 1 verifier, 1 fix round. The round-1 HIGH (MediaSession callbacks bound to the Capacitor plugin thread by lazy construction) is fixed by main-thread construction plus explicit main handlers. All 5 items verified FIXED; compile clean; device-verified on the Pixel (swipe-away stop, media keys after reopen, stop on recreate). Remaining LOWs: onEngineInit has no isShutDown check (microsecond window before kill); a font-scale/RTL recreate stops the voice (fontScale not in configChanges).
<!-- SECTION:NOTES:END -->
