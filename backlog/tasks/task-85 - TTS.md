---
id: TASK-85
title: 'TTS: listen to books (read-aloud)'
status: Done
assignee: []
created_date: '2026-04-26 15:59'
updated_date: '2026-10-20 23:58'
labels: []
milestone: m-14
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Let the reader listen to a book with Android's on-device TextToSpeech, free and offline, also with the screen off and from car/Bluetooth media controls. Listening moves the book's word position like reading does. Listening should count toward goals and streaks but not toward reading-speed stats (avg WPM etc).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The spoken word is highlighted live and the view follows it in scroll and page view without re-rendering the reader per word
- [x] #2 Pause then play resumes at the exact word that was being spoken
- [x] #3 After an interruption (navigation prompt, call, Bluetooth/headphone disconnect) playback resumes a configurable number of words back
- [x] #4 Speech uses the original text (unicode, quotes, dashes) and never speaks markdown heading markers
- [x] #5 Scrolling or jumping while listening detaches following and shows Back to voice / Read aloud from here; speech continues
- [x] #6 Media notification and lock screen show cover, title, author and chapter with previous/next sentence, play/pause and stop; Bluetooth media buttons work
- [x] #7 Sleep timer stops playback after 15/30/45/60 minutes or at end of chapter
- [x] #8 Listening is recorded as reading sessions with mode listen, counted for time, streaks and goals, also while the screen is off
- [x] #9 Listen sessions never affect speed stats: average WPM, WPM trend, fastest book, time left, goal pace, profile reading speed
- [x] #10 Server accepts listen sessions (zod + CHECK constraint) and live board shows listeners without wpm
- [x] #11 Read aloud settings page: rate, pitch, rewind words, follow text, voice per language, links to system TTS settings and voice install
- [x] #12 Player bar in reader: previous/next sentence, play/pause, rate, sleep timer, voice, stop
- [x] #13 Leaving the reader stops playback and saves position and session
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
See approved plan /home/jan/.claude/plans/precious-beaming-curry.md. Order: 1 core+server listen mode & speed exclusion, 2 native player rework, 3 JS segmenting/ReadAloud/listen sessions, 4 app stats exclusion+labels, 5 settings, 6 reader UI (highlight, follow, pill, player bar, sheets), 7 docs/changelog. Server deploys before app.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Full feature built on top of the spike (uncommitted).

ROLLOUT: deploy apps/web (migration 0039_listen_session_mode + zod enums) BEFORE releasing the app. An old server rejects the whole sync push (400) when it contains one listen row, and live reports 400 → client stops live reporting.

Native: TtsPlayer (word cursor via onRangeStart + "gen:segment:offset" utterance ids; generation counter drops stale callbacks; rewind N words after focus loss / becoming noisy; sleep timer incl. chapter end; listen-log intervals drained by JS; cover art downscaled; voice preview never leaks into book playback; engine-init failure and refused/failed utterances end with reason "error"), TtsService (mediaPlayback FGS, MediaStyle notification with prev/play/next/stop, shutdown via ACTION_SHUTDOWN so startForeground is always reached), TtsPlugin. Manifest <queries> TTS_SERVICE.

JS: services/tts (segments from raw content via WordIndex.charOf + Intl.Segmenter, 60-word / 1500-char cap; ReadAloud; global sent-segment registry for log mapping; pace.ts learns each voice's wpm at rate 1 and converts the WPM target to a rate; listen-sessions ListenRecorder; voices). services/reading-sessions holds SessionRow, sitting rules and persistRow (moved out of the reader page).
Reader: CSS custom highlight for the spoken word, followWord on scroll/page views, detach on user scroll/touch/settle with Back to voice / Read aloud from here, tap/jump/scrub moves the voice (debounced), RSVP driven by the voice, player bar (prev/next sentence, play/pause, WPM stepper + measured pace, sleep timer, voice, stop). Visual session sitting ends when listening starts.
Stats: listen mode counts for time/streaks/goals; excluded from every speed figure via isMeasurableSitting (core) and on the server profile + live board.
Settings: device-local tts_wpm/pitch/rewind/voices/follow (migration 0042), settings page with per-language voice picker, system TTS settings + voice download links.

Review: 5-agent rcktbs review run; all must-fix and nearly all nice-to-have findings fixed. Not done: a single "voice owns the position" seam in reader index.tsx (gating stays at the 6 call sites).

Second review (3 reviewers + adversarial verifier, 34 findings, 29 confirmed) fixed: refused look-ahead utterance stall, skip after interruption rewinding into the skipped sentence, sleep timer lost during a focus pause, pause during cold start, silent waiting counted as listening, chapter-end sleep across batch boundaries and by title (explicit opensChapter flag), pending move restarting after Stop, old voice dragging view back during a move, sleep timer dropped on move/read-from-here, scrub progress bar frozen, RSVP voice-mode scroll guards (bogus detach), stale measured wpm, baseline saved under wrong voice, voice-missing toast per tap, failed stop leak, restart at end of book, tap jitter detaching (8 px threshold), tracker/live gated on read aloud active (paused too). Also: READING_MODES const + MeasuredReadingMode in core, services/reading-sessions split into rules.ts (pure) and persist.ts, append retry.

Crash hunt + device smoke (30 native calls, media keys, chapter-end sleep, waiting interval, UI tap/stop race) clean. Media buttons needed SilentTrack (in-process silent AudioTrack) because speech audio belongs to the TTS engine's process; without it Android routed buttons to YouTube. Capacitor getLong rejects Integer values (sleep timer was a no-op before).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Read aloud for Android using the on-device TextToSpeech engine (free, offline): native TtsPlayer/TtsService/TtsPlugin with word-accurate resume, rewind after interruptions, sleep timer, media session + silent track so lock screen, headset, Bluetooth and car buttons reach the app, cover/chapter in the notification. Reader highlights and follows the spoken word (scroll and page view), detaches on user scroll, moves the voice on word tap/jump/scrub, RSVP driven by the voice, player bar with WPM speed (learned per voice), sleep timer, voice picker. New "listen" session mode recorded from the voice's playback log: counts toward time, streaks and goals, excluded from every speed figure (app, profile, live board). Device-local settings page (migration 0042), server accepts listen sessions (web migration 0039). Two multi-agent reviews plus a crash hunt; unit, web, core, both e2e suites and on-device smoke tests green.

Rollout: deploy the web server (migration 0039) before releasing the app. Real-world checks still worth doing: car/Bluetooth device, phone call mid-sentence, long screen-off listening.
<!-- SECTION:FINAL_SUMMARY:END -->
