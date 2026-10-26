---
id: TASK-206.6
title: >-
  Read-aloud: reading while paused is saved; stop while detached keeps the
  spoken word
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
labels:
  - reader
  - bug
  - read-aloud
dependencies:
  - TASK-208
modified_files:
  - apps/capacitor/src/pages/reader/use-read-aloud.ts
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/__tests__/use-read-aloud.test.tsx
  - apps/capacitor/src/pages/reader/page-view/index.tsx
  - apps/capacitor/src/services/tts/index.ts
  - apps/capacitor/src/test-hooks/tts.ts
  - apps/capacitor/e2e/read-aloud-position.spec.ts
  - apps/capacitor/e2e/types.d.ts
  - apps/capacitor/playwright.config.ts
parent_task_id: TASK-206
priority: medium
ordinal: 180500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Code-confirmed (read-aloud is Android-only, so no web e2e): isReadAloudActive = readAloud.status !== "off" (pages/reader/index.tsx), so it is true while PAUSED (sleep timer, audio focus, unplug). handleScrollPositionSettle then calls detach and returns, handleSetProgressWord returns early, and the flushes save the last spoken word. So reading by scrolling or turning pages while read-aloud is paused is never saved; the spot is lost unless play is pressed.

Fix: the voice owns the position only while it is PLAYING and followed. While paused, normal reading saves as usual. Owner decisions to honour:
- When play is pressed after the reader moved while paused, the voice restarts at the reader's current word.
- Read-aloud stopped while the view was detached (user scrolled away while it was playing): the saved word stays the spoken word, and the view becomes browse (Back / Read from here).

Test: unit tests around the owner logic plus a DEV fake TTS engine for e2e if feasible; a manual pass on the Pixel is documented in the notes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With read-aloud paused, a scroll or page turn saves the new position (test)
- [x] #2 Resume after a move while paused starts the voice at the reader's current word
- [x] #3 Stop while detached-and-playing saves the spoken word and leaves the view in browse mode
- [x] #4 Manual Pixel pass documented: pause via sleep timer, read, leave, reopen lands on the read spot
- [x] #5 Full capacitor e2e suite, vitest, tsc, biome pass; Android build succeeds
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 (lese-worker), for review.

Model: the voice owns the position only while it is PLAYING.

Hook (use-read-aloud.ts):
- New onReaderMove(viewWord), called for a reader's move (a scroll or page settle that moved the text and isn't a jump being reconciled). It always detaches, recording the view word.
  - Playing: returns true, and the voice keeps the position (as before).
  - Paused: returns false and sets hasYieldedRef. The reader's move is then saved as normal reading, and a later stop no longer saves the spoken word over it.
- start() clears hasYieldedRef.
- Resume after a move while paused (owner decision O4) already went through readFromView, because the move detaches with the view word. A test now pins it.
- endSession, when not yielded: saves the spoken word, and if the view was detached calls the new onStopDetached(viewWord) (owner decision Q2).

Reader (index.tsx):
- ReadAloudHandle gains ownsPosition (status === 'playing') and onReaderMove.
- handleScrollPositionSettle: if read-aloud is active, a reader move goes to onReaderMove and a non-move to ownsPosition; it returns only when the voice keeps the position. Otherwise it falls through to the normal settle save.
- handleSetProgressWord skips ticks only while ownsPosition, so flushes track the reader while paused.
- handleReadAloudStopDetached (not in RSVP): browse.enterForJump(viewWord). The anchor is the spoken word (lastWordRef, already saved), and lastWordRef/settledWordRef become the view word, so the view browses with Back / Read from here.

Tests: new __tests__/use-read-aloud.test.tsx (5), with services/tts mocked by a fake session whose onWord/onPlayingChange the test drives:
- playing + move keeps the voice;
- stop after a move while playing saves the spoken word and hands back the view word;
- paused + move yields: no save on stop, no hand-back;
- play after a paused move starts a new session at the view word;
- play without a move resumes the same session.
Red checks: with no yield while paused, the paused case fails; without the hand-back, the stop-detached case fails.

Not covered by a red test: the reader-side wiring (the paused settle and ticks saving; the stop handler entering browse). Read-aloud is Android-only (IS_READ_ALOUD_SUPPORTED), so a web e2e would need a DEV fake of the native Tts plugin. Not built (lean loop); it can be added if wanted.
AC#1 and AC#3 are covered at the hook level only, so they are left unchecked for the reviewer. AC#4 (the manual Pixel pass) needs the device and the owner; not done.

Also folded in (TASK-206.4 follow-ups from the verifier):
- An unmeasured crossing superseded by a jump no longer land-settles: completeInFlightAnimation sets isDroppingSettleRef while the commit runs without settle, and the unmeasured onDone sets settleOnLandRef = !isDroppingSettleRef.
- A non-pending pointer-down clears a stale ignored pointer id (a mouse released outside never sent pointer-up).
- No tests for these two: an unmeasured neighbour chunk and an outside mouse release are hard to force cheaply.

Test infra: playwright.config takes E2E_PORT (default 3001) and starts vite with --port <PORT> --strictPort. Another project's vite (rcktbs-stack apps/web) was serving :3001, and Playwright silently reused it: a full run failed at every import setup. That run is discarded; it was rerun on E2E_PORT=3101.

Results:
- tsc (app + e2e), biome (pre-existing warnings only), vitest 1366/1366;
- full default e2e run 210/210 (6.3 min, port 3101);
- @lowfps 4/4;
- Android: pnpm run sync + ./gradlew assembleDebug succeeded (app-debug.apk); gradle daemon stopped afterwards;
- no leftover processes.

2026-10-26 lese-planner: review round 1 (3 reviewers): 2 HIGH (an app resume after a paused yield overwrites the reader's save; paused settles can enter browse, then play from the controls runs while browsing and nothing is saved) plus mediums (native resume via earbud/notification/focus bypasses O4 and keeps the yield; sleep-timer/skip while yielded save the spoken word; Back to voice keeps the yield; RSVP while paused not saved; Playwright reuse). Batch sent to lese-worker. New owner decisions: (Q-a) the voice pausing while the view is detached saves the spoken word and enters browse at the view (like stopping while detached); (Q-b) RSVP stepping while paused counts as reading (yield + save); (Q-c) TOC/search/scrubber/word tap while paused moves the view only and stays paused (yield + save; play resumes from there); while playing, a jump still moves the voice.

2026-10-26 owner decisions (via lese-planner), appended to the TASK-206 decisions:
- Q-a: the voice pauses while the view is detached: browse at the pause. On any pause (user, earbuds, sleep timer, focus), save the spoken word and browse.enterForJump(viewWord), as for a stop while detached. The silent yield applies only when the view was following at the pause and the reader moves afterwards.
- Q-b: RSVP stepping while read-aloud is paused counts as reading: the reader takes over (yield), the RSVP word is saved, and resume reads from it (the same keepsPositionOnMove decision as scroll and page mode).
- Q-c: a TOC/search/scrubber/word-tap jump while paused moves only the view and stays paused. It is saved as the reader's position (yield), and play then reads from there (O4). While playing, today's behaviour stays (a jump moves the voice).

2026-10-26 review fixes (3 reviewers, 2 HIGH) + DEV fake Tts e2e (lese-worker).

One model in the hook (use-read-aloud.ts): hasYieldedRef means the reader has taken the position from a paused voice.
- Yield guard: while yielded, saveSpokenWord is a no-op and onWord only updates spokenWordRef (no report, no save). The app-resume catch-up checks it too. This covers HIGH 1 (an app switch after a paused move overwrote the reader's save and reseeded lastWordRef/settledWordRef), the sleep timer or a refused play reporting a pause while paused, and skip while paused.
- start() clears the yield. A state(true) while yielded (a native resume: earbuds, notification, focus regained) restarts at the view word through readFromView. The cursor report the engine sends before state(true) is dropped by the guard.
- resumeFollowing (back to voice) clears the yield and saves the spoken word. handleBackToVoice first sets lastWordRef/settledWordRef to it and leaves browse via browse.readFromHere().
- Q-a: onPlayingChange(false) when not yielded saves the spoken word and, if detached, calls onStopWhileDetached(viewWord), the same handler as a stop while detached.
- Q-c: moveTo returns whether the voice took the move. Paused, it calls keepsPositionOnMove (detach + yield) and returns false.
- New required option onBeforeStart, called at the top of every start (toolbar, player play, Listen from here, native-resume restart, jump while playing). The reader passes browse.readFromHere, so playback never runs while browsing (HIGH 2). The toolbar's handleReadAloudToggle is deleted; it was a duplicate.
- Renamed onReaderMove to keepsPositionOnMove. New ownsPosition() getter (active and not yielded). onStopWhileDetached (was onStopDetached) is required.

Reader (index.tsx):
- the settle uses keepsPositionOnMove for a move and ownsPosition() otherwise, and doesn't feed browse.recordSettle while read-aloud is active (HIGH 2);
- ticks are skipped while ownsPosition();
- jumpToWord, word tap and RSVP navigate use moveTo's result: paused, the view moves and the reader's spot is saved (no enterForJump);
- handleRsvpPositionChange uses keepsPositionOnMove (Q-b).

page-view: isDroppingSettleRef is reset in a finally.

DEV fake Tts (src/test-hooks/tts.ts): implements the TtsPlugin interface (now exported) and is enabled by window.__lesefluss_e2e_fakeTts before load. services/tts uses it under `import.meta.env.DEV && isFakeTtsRequested()`, and IS_READ_ALOUD_SUPPORTED is true then. The driver window.__lesefluss_e2e_tts offers speak(n) (progress per word, needMore when out), isPlaying() and starts(). Pause and resume come from the real UI buttons. A production vite build contains no trace of it (grep of dist).

Tests:
- hook (use-read-aloud.test.tsx, 13):
  - playing: a move keeps the voice; a stop and a pause (Q-a) while detached save the spoken word and hand back the view; onBeforeStart runs.
  - paused + moved: a stop saves nothing; an app-switch catch-up saves and reports nothing; sleep/focus pauses save nothing; a skip saves nothing; play reads from the view; a native resume (cursor first, then playing) restarts at the view; back to voice saves the spoken word again; a jump moves only the view (Q-c).
  - paused without a move: play resumes the same session.
  Each rule red when mutated: the onWord guard, the app-resume guard, the native-resume restart, the Q-a pause, the resumeFollowing yield reset, moveTo while paused.
- e2e (read-aloud-position.spec.ts, 11, fake Tts):
  - paused + move saved, stop keeps it (scroll + page);
  - stop while detached saves the spoken word and browses (scroll + page);
  - playing + move: only the voice saves;
  - play after a paused move reads from the reader's word;
  - once yielded, leaving mid-scroll saves the scrolled-to spot (ticks);
  - Q-a pause while detached browses, and play from the player leaves browse and saves again;
  - paused fast long scroll (a 400-paragraph book) is saved and doesn't browse;
  - Q-c word tap while paused is saved, and the voice stays paused;
  - Q-b RSVP steps while paused are saved.
  Red per glue (each mutation restored): R1 the old paused settle (5 fail), R2 ticks while active (1), R3 no browse on a detached stop/pause (3), R4 a playing move falling through (1), R5 the browse detector fed while active (1), R6 no browse commit before start (1), R7 the old word tap (1), R8 the old RSVP step (1).

Playwright: reuseExistingServer is opt-in (E2E_REUSE), since --strictPort alone doesn't stop reuse. E2E_PORT is validated (a 4-5 digit port number, else it throws).

Results:
- tsc (app + e2e), biome (pre-existing warnings only), vitest 1374/1374;
- full default e2e run 221/221 (6.5 min, E2E_PORT=3101);
- @lowfps 4/4;
- no leftover processes.
- The Android build was not rerun after this batch (JS only; the earlier assembleDebug passed).

AC#1 and AC#3 are checked now (reader-level e2e). AC#4 (the manual Pixel pass) is still open; it needs the device and the owner.

2026-10-26 real input yields while paused (lese-worker; planner decision: a paused reader shouldn't save less than without read-aloud).
- The reader's real-input handlers call readAloud.keepsPositionOnMove(null) instead of detach(): a touch drag past DETACH_DRAG_PX, a wheel (not on the player), the scroll keys PageUp/PageDown/ArrowUp/ArrowDown/Home/End (ignored in inputs), and a pointer-down on the scroller element itself (the scrollbar).
  - Playing: only detaches, as before.
  - Paused: yields, so the scroll's ticks feed lastWordRef and a leave before the settle flushes the scrolled spot.
- keepsPositionOnMove takes a null view word (unknown until the settle); play then reads from the first visible word.
- The voice's own follow scrolls never pass through these handlers.
- e2e (e) is now the unsettled case: pause, a trusted mouse wheel, leave before the settle (settle count asserted unchanged); the DB holds a word past the spoken one, and the reopen lands on it. Green 3/3; red when the wheel only detaches (it saved 29, the spoken word).
- Results: tsc (app + e2e), biome, vitest 1374; full e2e run 221/221 (E2E_PORT=3101); @lowfps 4/4; no leftover processes. The owner/planner now builds for the Pixel pass (AC#4).

2026-10-26 lese-planner, Pixel 8 Pro device pass (debug build of the working tree incl. yield-on-input; In Search of Lost Time; DB read over adb run-as):
- Sleep timer (15 min) paused read-aloud at 12:06:43 and saved the spoken word 201149; a touch scroll saved 200907; leave + reopen landed on 200907 (AC#4).
- Paused, scroll (saved 197504), app switch + return: unchanged (HIGH 1 fixed). Leave + reopen on 197504, no write.
- Play after the reopen started at the view word (O4).
- Scrolled back while playing (voice kept saving), then pause: spoken word 197656 saved, a later small scroll saved nothing (Q-a browse), reopen on 197656's line.
Also green on device for TASK-206: scroll reopen x3 (same word/offset, no write); opening another book x3 didn't re-stamp it; TOC jump lands the heading at the top and Read from here saves the heading word; A+/A- no save; page-mode jump + turn while browsing + Read from here + quick turns + reopen all on the saved page.
Observation (not chased): while browsing after a TOC jump, the footer chapter label briefly showed the previous chapter ('Combray · 1 min left') with the Swann in Love heading at the top; correct after Read from here.

2026-10-26 verifier HIGH + planner tweak (lese-worker).

HIGH: the voice played while the view was detached, the system paused it (Q-a browsed with the spoken word saved), then the system resumed it: it played on while browsing, so every save was skipped.

Fix, on a native resume (onPlayingChange(true)):
- yielded (the reader moved while paused): readFromView, a new session at the view word (O4); its onBeforeStart leaves browse;
- detached but not yielded (only a glance away): the new required option onBackToVoice, wired to handleBackToVoice. It sets lastWordRef to the spoken word, leaves browse via readFromHere (no write: anchor = spoken word) and resumes following, and the same session carries on.
- start() sets isFollowingRef synchronously, so a new session's own 'playing' isn't read as a resume while detached.

Also:
- the app-switch catch-up forwards onWord only while playing and following (spokenWordRef is always updated), so it doesn't pull a paused or browsing view back;
- the scroll-key handler uses the new isReaderKey(e) from use-keyboard-shortcuts (INTERACTIVE_SELECTOR, plus the overlay check).

Tests:
- hook 15/15: a glance resume calls onBackToVoice in the same session; a yielded resume starts a new session at the view word; the catch-up while paused away reports nothing.
- e2e (the fake Tts gained setPlayingBySystem): glance → system pause → browse → system resume → same session, browse hidden, listening saved at the paused word + 3; moved → system resume → a new session at the reader's word.
- Red checks: G1 the glance reads from the view (hook + e2e fail), G2 the glance does nothing (both fail), Y no restart when yielded (both fail); the catch-up forwarding always (hook fails).

Read-aloud e2e 15/15; tsc green. A reader-related e2e run was 145/148, the 3 being import-setup timeouts under the planner's parallel build; they pass alone.

Correction to the entry above: the read-aloud e2e spec has 13 tests and ran 13/13 (the 15 is the hook tests).

2026-10-26 lese-planner: accepted. Review round 1 (3 reviewers, 2 HIGH) → fixes + reader-level e2e via the DEV fake Tts; verifier found one more HIGH (a system resume after a Q-a pause stayed browsing, nothing saved) → fixed. Planner decision: on a native resume, yielded → read from the view word (O4); a glance (detached, not yielded) → back to voice, same session continues at the spoken word. Hook tests 15/15 and read-aloud e2e 13/13 with red checks for each rule; tsc clean; the last full run was 221/221 + @lowfps 4/4 before the final small batch, and the full suite reruns with TASK-206.7 in the same tree. Pixel device pass green (AC#4, see above).
<!-- SECTION:NOTES:END -->
