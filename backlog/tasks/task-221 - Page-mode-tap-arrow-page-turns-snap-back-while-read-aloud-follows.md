---
id: TASK-221
title: 'Page mode: tap/arrow page turns snap back while read-aloud follows'
status: Done
assignee: []
created_date: '2026-10-29 00:25'
updated_date: '2026-10-29 01:15'
labels: []
milestone: m-13
dependencies: []
priority: high
ordinal: 198000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Release review 2026-10-29, confirmed on Pixel (2 of 3 tap turns reverted). page-view followWord -> jumpAfterTurn -> completeInFlightAnimation({settle:false}) drops the turn's settle (the only detach path for tap/arrow turns), then moveTo(spoken, onlyIfOffPage) slides back. Swipes work (touchmove detaches). Relevant: page-view/index.tsx ~658-664, ~796-799; reader index.tsx handleSpokenWord ~1104. Related to TASK-216.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: a real reader page turn detaches read-aloud before it slides. PageView has a new onTurnStart prop, called in goToPage (reader turns only, after the isLayoutReady guard) and crossToNeighbor (after its guards); never for jumps (moveTo passes shouldSettle false) or the rubber-band at either end, which still only hides the progress bar via onHideProgressBar. The reader's handlePageTurnStart calls readAloud.keepsPositionOnMove(null) and sets isFollowingVoiceRef false at once. e2e (read-aloud-position.spec): next tap / ArrowRight / prev tap / ArrowLeft with a word spoken mid-slide (stays on the new page, Not following shown, only read-aloud saves, saved = spoken); paused edge tap on the last page (no save, Resume carries on with the same session at spoken+1). New turn tests fail without the fix; the edge test fails with onTurnStart at the top of goNext.

Planner verification (2026-10-29): 3 reviewers + verifier, 1 fix round; all items FIXED. tsc clean (web, capacitor), sync+reader vitest 458/458, targeted e2e green (2 import-setup timeouts passed on rerun). Planner fixed 2 stale wordings (sync-wipe.ts comment, CONTEXT.md 'like settings'). Remaining LOWs: no e2e for a chunk-crossing turn mid-slide or the start-of-book edge; gating test doesn't assert sessions stay gated; a fast-clock device can bring back a goal after Delete reading stats until real time passes its stamp (see TASK-226).
<!-- SECTION:NOTES:END -->
