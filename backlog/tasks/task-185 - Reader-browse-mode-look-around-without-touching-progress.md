---
id: TASK-185
title: 'Reader browse mode: look around without touching progress'
status: Done
assignee: []
created_date: '2026-10-02 17:10'
updated_date: '2026-10-02 19:27'
labels:
  - reader
dependencies: []
modified_files:
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/browse-detector.ts
  - apps/capacitor/src/pages/reader/browse-bar.tsx
  - apps/capacitor/src/pages/reader/use-reading-session.ts
  - apps/capacitor/src/pages/reader/session-tracker.ts
  - apps/capacitor/src/pages/reader/use-keyboard-shortcuts.ts
  - apps/capacitor/src/theme/monochrome.css
  - apps/capacitor/src/pages/reader/__tests__/browse-detector.test.ts
  - apps/capacitor/src/pages/reader/__tests__/session-tracker.test.ts
  - apps/capacitor/e2e/browse-mode.spec.ts
  - apps/capacitor/e2e/page-objects/reader.ts
  - apps/capacitor/e2e/jump-settle-guard.spec.ts
  - apps/capacitor/e2e/search-jump.spec.ts
  - apps/capacitor/e2e/position-end-of-book.spec.ts
  - CONTEXT.md
  - agents/capacitor.md
priority: medium
ordinal: 131000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every navigation in the reader (TOC, search, highlights, glossary, scrub, scroll settle) immediately becomes the saved position via `savePosition` in `apps/capacitor/src/pages/reader/index.tsx`. That write reaches the DB, the BLE device, cloud sync, the library sort, `finishedAt` (set permanently past 95%) and the buddy-read furthest word (spoilers unlock permanently), and sessions keep counting browse time, which drags WPM down. Users are afraid to look things up in a book.

Add a browse mode. Jumps, and long-distance manual scrolls, enter browse with an anchor at the committed reading position. While browsing, nothing is persisted and the session is paused. A pill offers "Back to reading" (return to the anchor) and "Read from here" (commit the current spot and start a fresh session).

Full plan: ~/.claude/plans/glistening-jumping-tulip.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A TOC, search, highlight, glossary or standard-mode scrub jump to a different word enters browse mode (from any mode, including RSVP) and does not persist the jump target
- [x] #2 A manual scroll/page move whose trailing run of faster-than-reading steps (>1200 WPM) spans >=2000 words enters browse mode, anchored where reading pace stopped
- [x] #3 On entry the anchor is persisted if not already in the DB; while browsing no other DB/localStorage/BLE/sync position write happens (RSVP excepted), including unmount and background flushes; reopening resumes at the anchor
- [x] #4 The reading session is paused while browsing and rewound to the anchor on entry; live board and session position report the anchor
- [x] #5 'Back to N%' returns the view to the anchor without a write and continues the same session
- [x] #6 'Read from here' commits the current word (including a tapped word) and starts a fresh session
- [x] #7 Resumed reading at the browsed spot (>=3 forward reading-pace settles over >=2 min) auto-commits with an Undo toast
- [x] #8 The progress bar shows the anchor tick while browsing; RSVP seeks never enter browse; toggling to RSVP while browsing commits; RSVP unmount flush can no longer overwrite a jump target
- [x] #9 A reader toolbar button enters browse mode manually at the current position
- [x] #10 Unit tests for both detectors and tracker rewind; e2e browse-mode spec; jump-dependent specs updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review pass (5 fresh reviewers + adversarial re-review) found and fixed: stale long-move detector history after RSVP/BLE (now chain-aware via settledWordRef), highlight/glossary jumps from RSVP entering invisible browse (all jumps via navigateToWord; savePosition never gated in RSVP), pre-existing RsvpView unmount flush clobbering jump targets (reports ignored once readerModeRef != rsvp; exitRsvpToStandard pauses first and flips readerModeRef before its save), anchor not durable (written on entry if != persistedWordRef), session leaking browsed spot (tracker.rewindTo). User verified on device.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reader browse mode: users can look around a book without moving their saved position, session or stats.

- Entry: any jump (TOC, search, highlight, glossary, standard scrub; also from RSVP), a fast long manual move (chain-aware `createLongMoveDetector`: trailing run of >1200 WPM steps spanning >=2000 words), or the toolbar Compass button. Anchor = committed position, written on entry if not already in the DB.
- While browsing: `savePosition` is a no-op (except in RSVP), flushes skip, session paused and rewound to the anchor (`SessionTracker.rewindTo`), live board reports the anchor, chapter auto-advance off, BLE updates move the anchor.
- Exit: "Back to N%" (no write, same session), "Read from here" (commit, new session), auto-commit with Undo toast after resumed reading (`createReadingResumeDetector`: >=3 forward reading-pace settles over >=2 min), or toggling to RSVP.
- Fixed a pre-existing bug: RsvpView's unmount flush overwrote jump targets when leaving RSVP; `exitRsvpToStandard` now pauses first and flips `readerModeRef` before saving.

Tests: 940 unit tests pass (new detector + tracker rewind tests); full e2e 117/117 (new browse-mode.spec.ts; jump-dependent specs commit via "Read from here"). Reviewed by 5 fresh reviewers + an adversarial re-review; user verified on device.

Follow-ups: extract browse logic into a hook; e2e for the 2-min auto-commit; reading before an auto-commit isn't credited to stats.
<!-- SECTION:FINAL_SUMMARY:END -->
