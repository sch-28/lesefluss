---
id: TASK-107
title: Add CI pipeline for typecheck and tests
status: To Do
assignee: []
created_date: '2026-04-29 19:08'
labels:
  - infra
  - dx
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The repo has a `release.yml` workflow but no CI step that runs on PRs/pushes. `pnpm check-types` (tsc + vitest) should run automatically to catch regressions before merge.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 GitHub Actions workflow runs on push and pull_request to main
- [ ] #2 Runs `pnpm check-types` in apps/capacitor (tsc --noEmit + vitest)
- [ ] #3 Live tests (*.live.test.ts) are excluded — they require network and run separately
- [ ] #4 Workflow fails the PR if typecheck or unit tests fail
<!-- AC:END -->
