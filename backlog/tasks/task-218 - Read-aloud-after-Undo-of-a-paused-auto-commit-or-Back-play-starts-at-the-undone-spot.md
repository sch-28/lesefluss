---
id: TASK-218
title: >-
  Read-aloud: after Undo of a paused auto-commit (or Back), play starts at the
  undone spot
status: To Do
assignee: []
created_date: '2026-10-26 03:15'
labels:
  - reader
  - bug
  - read-aloud
milestone: m-13
dependencies: []
priority: medium
ordinal: 191000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the TASK-214 verification. Read-aloud paused, the user reads on by eye, browse auto-commits, the user taps Undo: the view jumps back to the anchor (browse-controller undoAutoCommit → index.tsx showUnsavedMove), but read-aloud's viewWordRef still holds the read-by-eye word, because the jump's settle exits via isJumpSettle/ownsPosition. Pressing play then calls toggle → readFromView and starts the voice at the undone word, pulls the view there and saves it, undoing the Undo. The same gap exists for browse.back after a pause-opened browse (TASK-206.6).

Fix: in showUnsavedMove (and the browse back path), when read-aloud is active, call readAloud.detach(word) so play reads from the restored spot. Red-before e2e with the fake Tts.
<!-- SECTION:DESCRIPTION:END -->
