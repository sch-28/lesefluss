---
id: TASK-188
title: >-
  Browse mode follow-ups: extract controller, credit pre-commit reading, e2e
  auto-commit
status: Done
assignee: []
created_date: '2026-10-02 19:31'
updated_date: '2026-10-02 20:07'
labels:
  - reader
dependencies:
  - TASK-185
modified_files:
  - apps/capacitor/src/pages/reader/browse-controller.ts
  - apps/capacitor/src/pages/reader/use-browse-mode.ts
  - apps/capacitor/src/pages/reader/browse-detector.ts
  - apps/capacitor/src/pages/reader/browse-bar.tsx
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/session-tracker.ts
  - apps/capacitor/src/pages/reader/use-reading-session.ts
  - apps/capacitor/src/routes/tabs/reader.$id.tsx
  - apps/capacitor/src/theme/monochrome.css
  - apps/capacitor/src/pages/reader/__tests__/browse-controller.test.ts
  - apps/capacitor/src/pages/reader/__tests__/browse-detector.test.ts
  - apps/capacitor/src/pages/reader/__tests__/session-tracker.test.ts
  - apps/capacitor/e2e/browse-mode.spec.ts
  - apps/capacitor/e2e/page-objects/reader.ts
  - CONTEXT.md
  - agents/capacitor.md
priority: low
ordinal: 134000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-ups from TASK-185 (reader browse mode). (1) Browse logic is spread through apps/capacitor/src/pages/reader/index.tsx; extract a pure BrowseController class plus a thin useBrowseMode hook, mirroring SessionTracker/useReadingSession, and unit-test it. (2) Reading done in the ~2 min before an auto-commit is not credited to stats; the resume detector should report the reading streak, and SessionTracker.backfill should open the new sitting with it. (3) Add an e2e for the auto-commit and Undo toast using Playwright's clock. Plan: ~/.claude/plans/glistening-jumping-tulip.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Browse logic lives in browse-controller.ts (pure, unit-tested) + use-browse-mode.ts; index.tsx only wires call sites; behaviour unchanged
- [x] #2 An auto-commit opens a sitting that includes the reading streak before the commit (words + idle-capped active time)
- [x] #3 An e2e covers the auto-commit toast and Undo restoring the anchor
- [x] #4 Unit + full e2e suites pass
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Browse-mode follow-ups to TASK-185.

- Extracted browse logic into `BrowseController` (pure class, 16 unit tests) and a thin `useBrowseMode` hook; `index.tsx` only wires call sites.
- Auto-commit now credits the reading streak before it: `createReadingResumeDetector` reports `{ from, activeMs }`, with idle-capped and rounded time. `SessionTracker.backfill` opens the new sitting, credited up to the live-tracking ceiling. Undo discards it via `SessionTracker.discard`.
- Added an e2e for auto-commit and Undo using Playwright's `page.clock`.

A 3-agent review pass then found, and this task fixed:
- fractional backfill durations that would have broken sync permanently (the server requires integers);
- "Next chapter" while browsing dropping progress (it now commits first);
- a stale Undo or a cross-chapter write after a serial chapter switch. `BookReader` is now keyed by id in `routes/tabs/reader.$id.tsx`, which also fixes the pre-existing bug where a cached chapter opened at another chapter's word;
- skim and idle inflation of backfilled stats;
- `rewindTo` leaving a stale checkpoint row (it now overwrites it, even below the noise floor);
- test-quality issues: realistic resume tests, an RSVP-jump e2e that actually plays, exact assertions.

Verification: 967 unit tests, full e2e 118/118, lint clean. The only type error is the existing `content` one at HEAD.

Known residuals:
- Undo can't reverse a position that already synced to the server's buddy-read furthest word (push at 5 s vs a 10 s toast).
- `rewindTo` can drop spans genuinely read earlier in the same sitting in rare back-and-forth cases; fixing it needs a credit journal.
<!-- SECTION:FINAL_SUMMARY:END -->
