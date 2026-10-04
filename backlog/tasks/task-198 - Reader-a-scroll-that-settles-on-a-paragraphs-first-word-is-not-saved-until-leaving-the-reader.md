---
id: TASK-198
title: >-
  Reader: a scroll that settles on a paragraph's first word is not saved until
  leaving the reader
status: Done
assignee: []
created_date: '2026-10-04 19:33'
updated_date: '2026-10-04 19:33'
labels:
  - reader
  - progress
dependencies: []
modified_files:
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/browse-controller.ts
  - apps/capacitor/e2e/position-settle-paragraph-start.spec.ts
  - apps/capacitor/e2e/reader-images-progress.spec.ts
  - apps/capacitor/e2e/position-end-of-book.spec.ts
priority: high
ordinal: 154000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during the buddy-read device test (TASK-171.20). In scroll mode, scroll ticks set lastWordRef to the start of the paragraph at the top. The settle handler skipped its save when `lastWordRef.current === word`, which was meant as "nothing changed since the last save" (2c46053). Since ticks started writing lastWordRef (b606be6, e1c42fc), a settle that lands on a paragraph's first word, or anywhere inside a figure or TOC-fallback heading rendered above a paragraph, was never saved mid-session. Only the exit, background or pause flush wrote it. Effects: lastRead, sync, BLE and buddy live progress lagged; a kill without a pause event lost the move. Short-paragraph and dialogue-heavy books and illustrated books hit it often. The e2e suite missed it because mid-session settle saves were only exercised with wheel scrolls at arbitrary pixel offsets, and exit flushes hide the skipped save (one spec comment even described the skip as expected).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A settle on a paragraph's first word saves that word without leaving the reader
- [x] #2 A settle with the top edge inside a figure above a paragraph saves that paragraph's first word
- [x] #3 Settling back on the already saved word saves nothing (opening a book still does not bump lastRead)
- [x] #4 Jump-reconcile settles keep the jump target (browse jumps, page-mode same-page jumps)
- [x] #5 E2E spec fails on the old settle logic and passes on the new one
<!-- AC:END -->



## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
`handleScrollPositionSettle` now skips the save only when the settle word equals `persistedWordRef` (what the DB holds), instead of `lastWordRef` (which ticks overwrite). That early return also sets `lastWordRef` to the word, so exit/background flushes and autoCommit never use a stale tick word. Jump-reconcile settles are handled first with exactly the previous behaviour, so a reconcile settle that reports the browse anchor cannot overwrite the jump target.

Proof: new e2e spec `position-settle-paragraph-start.spec.ts` (paragraph-start settle + reload resume, consecutive paragraph starts, top edge inside a figure, mid-paragraph control, settle back on saved word). Against the original logic: 4 fail, the mid-paragraph control passes. With the fix: 15/15 over 3 repeats. Full capacitor e2e 142/142, unit tests green. Reproduced and verified on a Pixel 8 Pro: a settle exactly on a paragraph start (word 1848) now saves and syncs while the reader stays open.

Review: 5 independent reviewers (ref semantics + history, browse mode, other modes/paths, proof quality, refetch hook). They confirmed the new comparison matches the original intent, no lastRead bump on open, no reopened clobber bugs (route remount, RSVP flush), and browse-mode behaviour unchanged. The jump-guard regression they found is fixed. Stale comments in browse-controller.ts and two e2e specs are updated.
<!-- SECTION:FINAL_SUMMARY:END -->
