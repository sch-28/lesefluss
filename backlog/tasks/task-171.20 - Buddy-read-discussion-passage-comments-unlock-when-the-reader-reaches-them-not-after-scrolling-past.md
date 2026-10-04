---
id: TASK-171.20
title: >-
  Buddy-read discussion: passage comments unlock when the reader reaches them,
  not after scrolling past
status: Done
assignee: []
created_date: '2026-10-04 18:17'
updated_date: '2026-10-04 20:04'
labels:
  - social
  - buddy-read
dependencies: []
modified_files:
  - apps/web/src/lib/social/discussion-gate.ts
  - apps/web/src/lib/social/buddy-read-discussion.ts
  - apps/web/src/lib/moderation/targets.ts
  - apps/web/src/lib/push/compose.ts
  - apps/web/src/lib/social/buddy-read-discussion.integration.test.ts
  - apps/web/src/lib/push/drain.integration.test.ts
  - apps/capacitor/src/services/social/buddy-read-discussion.ts
  - apps/capacitor/src/services/social/__tests__/discussion-refetch.test.ts
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/social/buddy-read-discussion.tsx
  - docs/social-buddy-reads.md
parent_task_id: TASK-171
priority: high
ordinal: 152000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Device test: a member commented on a paragraph; another member reading that same paragraph saw neither the comment icon nor the comment. The spoiler gate (apps/web/src/lib/social/discussion-gate.ts) unlocked a passage comment only once its last word was behind the viewer's furthest position, and the saved position is roughly the first word on screen. So a passage on screen counted as unread until it had scrolled off the top. On top of that, the reader only refetched the discussion on its 60s poll, so unlocking lagged further.

Decision: unlock any item (passage, chapter comment, shared highlight) once the viewer is within a lookahead of about one screen (~250 words) of its start, because position means the top of the viewport. Spoiling at most about a screen ahead is acceptable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A passage comment is visible to a member whose furthest position is within the lookahead before the passage start
- [x] #2 A passage comment further ahead than the lookahead stays hidden
- [x] #3 Chapter comments, replies, reactions, shared highlights and push previews use the same gate rule
- [x] #4 The reader refetches the discussion soon after its progress moves past the last fetched position, without waiting for the 60s poll
- [x] #5 Gate unit/integration tests cover the lookahead boundary
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Gate: `isUnlockedFor` now opens any item (passage, chapter comment, shared highlight) once its start is within `UNLOCK_LOOKAHEAD_WORDS` (250) of the viewer's furthest position. A saved position is the top of the screen, so the old "last word read" rule hid passages the reader was looking at. Chapter comments get the same lookahead (one rule instead of two; they show when the chapter heading is about a screen away). `GatedAnchor` narrowed to `{ authorId, startWord }`; call sites in discussion, report targets and push previews updated.

Client: `useRefetchDiscussionAsYouRead` in the reader pushes the position and refetches once something is hidden and the reader is 100 words past the last fetch's `furthestWord` (and past the last attempt, so a failed push doesn't loop). Skipped while browsing or offline. The 60s poll stays.

Tests: integration fixtures scaled to a 1000-word book so the lookahead still leaves gated items; boundary test at start - lookahead (-1 hidden, exact visible). Unit test for `shouldRefetchDiscussion`. web lib 291/291, capacitor reader+social 153/153, tsc clean in both apps. In-app copy and docs/social-buddy-reads.md updated.

Review pass (3 reviewers): server and tests/docs clean. Client fix: the refetch trigger moved from a render effect on progressWord into writePosition right after the local DB commit (via onPositionSavedRef), because the effect could push before updateBook landed and send the old position. Browse saves never reach it. The last-attempt marker resets per buddy read.

Second review pass (5 reviewers) and device test: the client now refetches only once the reader reaches the server's `nextUnlockWord` (new DiscussionPage field: where the nearest hidden item unlocks, null when nothing is hidden) instead of every 100 words. That avoids a full library push every ~100 words while anything is hidden. Saves arriving mid-push are queued and run afterwards, gated on the refetch result rather than possibly stale hook data. Device test (Pixel, local server): comments unlocked ~1s and ~3s after scrolling into range. The device test also exposed a reader bug where settles on a paragraph start were never saved mid-session; that fix is tracked separately in its own task.

Final review (2 reviewers) on the post-review changes: server `nextUnlockWord` is clean, and the jump-settle restructure is identical to the old behaviour for jump settles. Client fixes applied: an undefined `nextUnlockWord` (older server) is treated like null, so there is no push every 100 words before the server deploy; and after a push that moved the server, the retry marker resets, so a second hidden item just past the first is not delayed. Deploy order: server first.
<!-- SECTION:FINAL_SUMMARY:END -->
