---
id: TASK-175
title: Social hardening from the branch review
status: In Progress
assignee: []
created_date: '2026-09-28 16:18'
updated_date: '2026-10-02 16:58'
labels:
  - social
  - web
  - app
  - tests
milestone: m-13
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A read-only review of the whole social branch (commits since cd04464, now b606be6) found robustness bugs in the live board, web-build and reader rough edges, a few small server issues, missing tests promised by earlier tasks, and no end-to-end coverage of the real `/app` web build. This parent groups the fixes. Each subtask carries its own testable acceptance criteria.

Subtasks:
- **A.** Live board robustness.
- **B.** Web build and reader fixes.
- **C.** Small server and website fixes.
- **D.** Missing tests.
- **E.** A Playwright end-to-end project against the `/app` web build.

Work runs in phases coordinated with the reviewing session: A, B and C are code fixes, E follows, and a manual device pass comes last.

Rules for all phases:
- Never run git commit, stash, push or any other git write; the user commits between phases.
- Web migrations are hand-written; never run `db:generate`.
- Integration tests use a throwaway database, never the dev database.
- Backlog edits only through the backlog MCP tools.

Out of scope: web-serial exclusion from social features (accepted as is), TASK-171.11 push, TASK-117, TASK-61, and App Links verification (TASK-171.16).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Subtasks A to E are Done, or explicitly descoped with a note on this task
- [ ] #2 Web, core and app unit/integration suites, typechecks and both Playwright projects pass at the end
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Status (2026-09-28)
Everything automated is green. Subtasks 175.1 to 175.6 are Done: the live board, the web build and reader fixes, the server and website fixes, the missing tests, the /app Playwright project, and the jeep-sqlite store-loss fix.

**Latest runs:**
- `pnpm e2e:app`: 11 of 11 in two full runs;
- existing `pnpm e2e`: 75 of 75;
- web: 225 of 225 on a throwaway database;
- core: 142 of 142;
- capacitor `check-types`: 681 of 681;
- Biome: clean.

**Remaining:**
- the user's manual pass, which includes the optional touch-callout check from TASK-175.2 #6 in a mobile browser;
- TASK-171.16 (Play App Links).
<!-- SECTION:NOTES:END -->
