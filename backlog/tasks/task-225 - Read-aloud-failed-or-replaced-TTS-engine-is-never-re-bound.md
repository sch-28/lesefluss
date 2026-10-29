---
id: TASK-225
title: 'Read-aloud: failed or replaced TTS engine is never re-bound'
status: Done
assignee: []
created_date: '2026-10-29 00:25'
updated_date: '2026-10-29 00:48'
labels: []
milestone: m-13
dependencies: []
priority: high
ordinal: 202000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Release review 2026-10-29. TtsPlayer singleton (~181-183) and permanent isEngineFailed (~534-536): after installing an engine from the prompt, or an engine crash/update mid-session, every speak fails until the process dies.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After an engine init failure the next play()/whenReady() binds a new TextToSpeech
- [x] #2 After MAX_CONSECUTIVE_ERRORS the next play()/whenReady() binds a new TextToSpeech
- [x] #3 TtsPlayer engine is bound lazily on the first plugin call
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TtsPlayer: tts no longer final; bindEngine() shuts the old engine down, bumps generation and an engineBinding counter (stale onInit ignored), creates a new TextToSpeech. play()/whenReady() rebind when isEngineFailed or shouldRebindEngine (set on MAX_CONSECUTIVE_ERRORS). onEngineInit no longer calls play() on failure (would rebind forever); it publishes REASON_ERROR. TtsPlugin: player created lazily via player() on the first plugin method (load() only attaches an existing instance); getVoices/checkLanguage now run whenReady inside guard since it can construct an engine. Verified on Pixel: (a) am force-stop com.google.android.tts mid-playback -> pause/play -> 3 refused utterances -> error, next Listen logged 'Sucessfully bound' and synthesized; (b) pm disable-user com.google.android.tts -> Listen -> 'TTS engine init failed: -1'; pm enable -> Listen -> rebound and synthesized. Engine re-enabled afterwards. Known gap: an engine killed mid-utterance gives no callback, so the player stays 'playing' silently until the user pauses/plays (then the error path + rebind apply); TextToSpeech has no public disconnect callback.

Review round 1: the engine is now bound lazily (tts == null triggers bindEngine in play()/whenReady()) while the player itself is constructed on main in load(). Rebind re-verified indirectly: every Listen in the round-1 device checks bound the engine on first use.

Planner verification (2026-10-29): 3 reviewers (threading, lifecycle, regressions) + 1 verifier, 1 fix round. The round-1 HIGH (MediaSession callbacks bound to the Capacitor plugin thread by lazy construction) is fixed by main-thread construction plus explicit main handlers. All 5 items verified FIXED; compile clean; device-verified on the Pixel (swipe-away stop, media keys after reopen, stop on recreate). Remaining LOWs: onEngineInit has no isShutDown check (microsecond window before kill); a font-scale/RTL recreate stops the voice (fontScale not in configChanges).
<!-- SECTION:NOTES:END -->
