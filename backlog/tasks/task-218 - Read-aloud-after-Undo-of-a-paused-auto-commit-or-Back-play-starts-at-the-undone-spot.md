---
id: TASK-218
title: >-
  Read-aloud: after Undo of a paused auto-commit (or Back), play starts at the
  undone spot
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 02:21'
labels:
  - reader
  - bug
  - read-aloud
milestone: m-13
dependencies: []
modified_files:
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/e2e/read-aloud-position.spec.ts
priority: medium
ordinal: 191000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the TASK-214 verification. Read-aloud paused, the user reads on by eye, browse auto-commits, the user taps Undo: the view jumps back to the anchor (browse-controller undoAutoCommit → index.tsx showUnsavedMove), but read-aloud's viewWordRef still holds the read-by-eye word, because the jump's settle exits via isJumpSettle/ownsPosition. Pressing play then calls toggle → readFromView and starts the voice at the undone word, pulls the view there and saves it, undoing the Undo. The same gap exists for browse.back after a pause-opened browse (TASK-206.6).

Fix: in showUnsavedMove (and the browse back path), when read-aloud is active, call readAloud.detach(word) so play reads from the restored spot. Red-before e2e with the fake Tts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After Undo of a paused auto-commit, play reads from the undone spot
- [x] #2 After browse's Back from a pause-opened browse, play reads from the spot Back went to
- [x] #3 Red-before / green-after e2e on the fake Tts
- [x] #4 Undo while the voice is playing again moves the voice to the restored spot (moveTo); its next save is the anchor
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: showUnsavedMove (index.tsx) calls readAloudRef.current.detach(word) when read-aloud is active. It is the shared view move behind browse.back and undoAutoCommit, so one site covers both. (handleExternalPosition already calls keepsPositionOnMove(word) before it, so the extra detach there is a no-op.)

Tests (e2e/read-aloud-position.spec.ts):
- "paused while looking away, Undo of the auto-commit makes play read from the undone spot": red before, the voice started at 512 instead of 34.
- "paused while looking away, browse's Back makes play read from where it went back to": red before, 389 instead of 34.
Green 3x each with E2E_WORKERS=2.

The Back test uses the annotations sheet's browse toggle. While read-aloud is active, the player (z-index 10, same bottom offset) covers the browse bar, and its own detached row (Back to voice / Listen from here) stands in for it. So browse-back is not clickable then; that's by design, not a bug.

Open edge, not fixed: an Undo tapped while the voice is playing again (play pressed inside the toast window) only detaches the view, and the voice keeps owning the position, so its next save overwrites the undone spot. moveTo(anchor) might suit that case better; it's the planner's call.

Checks: tsc (app, e2e) clean; biome shows only the pre-existing infos; full e2e 272/272 (68+31+56+117, E2E_WORKERS=2); @lowfps 4/4; port 3101 free.

Planner decision on the open edge, now done: showUnsavedMove calls readAloud.moveTo(word) while the voice is playing, and detach(word) while it is paused. New e2e test "Undo of a paused auto-commit tapped after play resumed moves the voice to the undone spot": red before (no second session start), green 3x. The DB holds anchor+2 after the next voice save. Checks: browse-mode + read-aloud-position 28/28, position-external 17/17, tsc clean.

2026-10-26 lese-planner: accepted after verification (DONE). showUnsavedMove: moveTo(word) while the voice plays (planner decision: Undo while playing moves the voice to the restored spot), detach(word) while paused; covers browse.back, undoAutoCommit and the adopt path (adopt/back can't run while playing). 3 e2e red before; full e2e 272/272, @lowfps 4/4. Known LOW: a one-render window where Undo in the same tick as play takes the detach branch (non-blocking).

2026-10-26 lese-worker: test stabilisation. In the full suite, the Back test failed about 1 run in 8 (and the Undo-while-playing test failed similarly). The voice saves were correct (spoken+2), but a `settle` at word 0 (the start of the paragraph holding the voice word) landed about 200 ms after the pause save. On resume the view scrolls to follow the voice, and that scroll's settle arrives after Pause, where the paused reader takes it as its own move. This bug predates 218; filed as TASK-219. Both tests now wait for the view to go quiet between speak and pause (waitPositionQuiet 1000; the Undo-playing test runs the fake clock first). Stressed 36/36, and still red without the 218 fix (3/3). Once TASK-219 is fixed, the waits should be removed.
<!-- SECTION:NOTES:END -->
