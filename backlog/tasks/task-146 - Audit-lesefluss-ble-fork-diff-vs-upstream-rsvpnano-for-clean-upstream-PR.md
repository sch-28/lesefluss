---
id: TASK-146
title: Audit lesefluss-ble fork diff vs upstream rsvpnano for clean upstream PR
status: To Do
assignee: []
created_date: '2026-05-21 22:48'
labels: []
milestone: m-12
dependencies: []
references:
  - 'https://github.com/ionutdecebal/rsvpnano'
  - 'https://github.com/sch-28/rsvpnano-lesefluss/tree/lesefluss-ble'
  - apps/rsvpnano
priority: medium
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The rsvpnano firmware lives in apps/rsvpnano as a git submodule of our fork sch-28/rsvpnano-lesefluss (branch lesefluss-ble). Eventual goal: contribute the BLE GATT service back to ionutdecebal/rsvpnano upstream. To make that PR small and focused, we need to audit every line we changed and categorize.

Today the branch has BLE integration (TASK-131.3, .12) plus a tail of small fixes, tracing patches (TASK-142), and likely incidental edits from other rsvpnano work. Mixed in a single branch they will look messy to upstream.

Steps:
1. `git diff upstream/main...lesefluss-ble --stat` from the submodule directory; enumerate every changed file with line delta.
2. For each file, classify each hunk into one of:
   - **upstream-worthy**: BLE service implementation, NimBLE wiring, the data-store delegate hooks, .rsvp delete characteristic — features the upstream maintainer would plausibly accept.
   - **lesefluss-specific**: anything that hard-codes lesefluss bookId paths, schema, hash convention, or our naming. Should move behind a build flag or to a separate file under apps/rsvpnano/lesefluss/ overlay.
   - **drive-by**: trace logs from TASK-142, .vscode tweaks, formatting churn, board JSON edits, web/library.js changes that don't relate to BLE. Either revert pre-PR or split into a follow-up.
3. Produce an apply-able strategy:
   - One commit (or series) on a new branch `upstream-pr/ble-service` containing only category 1.
   - lesefluss-ble keeps everything but rebases category-1 commits onto upstream cleanly.
   - Drive-bys either removed or filed as separate small PRs.
4. Re-run firmware build at every stage to confirm green.

Out of scope:
- Submitting the PR itself — that's a follow-up after the audit produces a clean branch.

References:
- Submodule path: apps/rsvpnano
- Upstream: https://github.com/ionutdecebal/rsvpnano (branch main)
- Fork: https://github.com/sch-28/rsvpnano-lesefluss (branch lesefluss-ble)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 git diff stat captured + each hunk categorized (upstream / lesefluss / drive-by) in a checked-in audit doc under backlog or docs/
- [ ] #2 A branch `upstream-pr/ble-service` exists on the fork containing only upstream-worthy commits; firmware builds green from that branch
- [ ] #3 Lesefluss-specific code lives behind a build flag or under a separate overlay path, not inline in upstream files where avoidable
- [ ] #4 Drive-by changes are either reverted on `upstream-pr/ble-service`, kept on `lesefluss-ble` only, or filed as separate small upstream PRs
- [ ] #5 lesefluss-ble still builds green and runs end-to-end after the rebase / split
<!-- AC:END -->
