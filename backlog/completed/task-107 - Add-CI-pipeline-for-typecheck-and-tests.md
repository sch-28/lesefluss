---
id: TASK-107
title: Add CI pipeline for typecheck and tests
status: Done
assignee:
  - OpenCode
created_date: '2026-04-26 19:08'
updated_date: '2026-04-26 12:08'
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
- [x] #1 GitHub Actions workflow runs on push and pull_request to main
- [x] #2 Runs `pnpm check-types` in apps/capacitor (tsc --noEmit + vitest)
- [x] #3 Live tests (*.live.test.ts) are excluded — they require network and run separately
- [x] #4 Workflow fails the PR if typecheck or unit tests fail
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `.github/workflows/ci.yml` as a dedicated CI workflow.
2. Trigger it on `push` and `pull_request` targeting `main`.
3. Use the same Node major version as the release workflow (`22`) with `pnpm/action-setup@v4` and `actions/setup-node@v4`.
4. Install dependencies from the workspace lockfile with `pnpm install --frozen-lockfile` at the repo root.
5. Run `pnpm check-types` from `apps/capacitor`, relying on the existing script (`tsc --noEmit && vitest run`) and default Vitest exclusion of `**/*.live.test.ts`.
6. Verify locally by running `pnpm check-types` in `apps/capacitor`, then update acceptance criteria and final notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reviewed root AGENTS.md, CLAUDE.md, agents/capacitor.md, existing release workflow, workspace/package scripts, and Vitest config. Proposed adding a dedicated CI workflow that installs with pnpm and runs the existing apps/capacitor check-types script; default Vitest config already excludes **/*.live.test.ts. Awaiting user approval before recording plan and editing files.

Added `.github/workflows/ci.yml` with push/pull_request triggers to main, pnpm workspace install, and `pnpm check-types` in `apps/capacitor`. Local verification passed: `pnpm check-types` completed `tsc --noEmit` and Vitest with 13 files / 164 tests passing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary
- Added a dedicated GitHub Actions CI workflow for pushes and pull requests targeting `main`.
- The workflow installs dependencies with pnpm and runs `pnpm check-types` from `apps/capacitor`, covering `tsc --noEmit` and the default non-live Vitest suite.
- Live tests remain excluded through the existing default Vitest config (`**/*.live.test.ts`), while failures in typecheck or unit tests fail the workflow.

## Verification
- Ran `pnpm check-types` in `apps/capacitor`: 13 test files passed, 164 tests passed.
<!-- SECTION:FINAL_SUMMARY:END -->
