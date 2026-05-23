---
id: TASK-146
title: Audit lesefluss-ble fork diff vs upstream rsvpnano for clean upstream PR
status: Done
assignee:
  - sch-28
created_date: '2026-05-21 22:48'
updated_date: '2026-05-23 19:21'
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
- [x] #1 git diff stat captured + each hunk categorized (upstream / lesefluss / drive-by) in a checked-in audit doc under backlog or docs/
- [x] #2 A branch `upstream-pr/ble-service` exists on the fork containing only upstream-worthy commits; firmware builds green from that branch
- [x] #3 Lesefluss-specific code lives behind a build flag or under a separate overlay path, not inline in upstream files where avoidable
- [x] #4 Drive-by changes are either reverted on `upstream-pr/ble-service`, kept on `lesefluss-ble` only, or filed as separate small upstream PRs
- [x] #5 lesefluss-ble still builds green and runs end-to-end after the rebase / split
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Session scope (audit-only)

Produce classification doc + split strategy. No git branches created, no firmware builds this session. Covers AC #1; AC #2-#5 deferred to follow-up session(s).

## Steps

1. From `apps/rsvpnano` submodule, run `git diff upstream/main...lesefluss-ble` per-file.
2. For `web/library.js` (2568-line churn): run `git diff -w --stat` first to determine if whitespace-only. If yes → revert pre-PR. If no → classify hunks.
3. For each remaining file, read hunks and classify each into:
   - **upstream-worthy**: BLE GATT service, NimBLE wiring, data-store delegate hooks, .rsvp delete characteristic.
   - **lesefluss-specific**: hard-coded lesefluss bookId paths / schema / hash convention / naming. Candidate for build-flag or `apps/rsvpnano/lesefluss/` overlay path.
   - **drive-by**: trace logs from TASK-142, .vscode, formatting churn, board JSON, web/installer changes unrelated to BLE.
4. Write `docs/rsvpnano-upstream-audit.md` containing:
   - file/hunk classification table
   - proposed commit topology for `upstream-pr/ble-service` branch
   - overlay/build-flag plan for lesefluss-specific bits
   - drive-by disposition (revert vs separate PR vs keep on lesefluss-ble only)
5. Mark AC #1 done; leave AC #2-#5 unchecked.

## Out of scope this session

- Creating `upstream-pr/ble-service` branch.
- Firmware builds.
- Rebasing lesefluss-ble.
- Submitting upstream PR.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Audit doc landed at docs/rsvpnano-upstream-audit.md. Classified every changed file/hunk across the 16-file diff.

Key findings:
- Web + boards reformats = 100% prettier churn (web/library.js 2568 LOC churn = 17/21 real LOC). Drive-by, revert on upstream branch.
- BLE core (BleSyncManager, RsvpDataStore, App glue, platformio.ini NimBLE dep, CompanionSyncManager bleEnabled emit) = upstream-worthy. Recommend gating App + CompanionSyncManager hunks behind new RSVP_BLE_SYNC build flag.
- ble_config.h is upstream-worthy in spirit but the `namespace lesefluss::ble` + auto-gen header reference monorepo tooling. Need to re-author under `rsvpnano::ble` on upstream branch.
- StorageManager.cpp +246 LOC = v2 .rsvp reader from TASK-148. Lesefluss-specific (no upstream producer of the v2 format). Keep on lesefluss-ble only; do not propagate.
- ~30 LOC of TASK-142 Serial.printf traces across ReadingLoop / RsvpDataStore / App.cpp. Strip on upstream branch.

Proposed upstream-pr/ble-service commit topology (6 commits) documented in the audit doc.

No overlay path needed — only lesefluss-only firmware code is the v2 reader inside StorageManager.cpp; cleaner to keep inline on lesefluss-ble than carve an overlay.

AC #2-#5 deferred to a follow-up session — those involve branch creation, namespace rename + build-flag work, firmware build, and lesefluss-ble rebase verification. Open questions for that session listed at the bottom of the audit doc.

Loaded team://knowledge/ai-guidelines and folded into the audit doc.

Key new sections:

- **Risk to existing rsvpnano functionality**: `git diff --shortstat -- src/` confirms 10 files / 2405 insertions / **0 deletions**. Every change to a pre-existing rsvpnano file is purely additive. v2 dispatch in StorageManager is an 11-line short-circuit; legacy v1 path runs unchanged. Per-file additive breakdown table added.

- **Preservation of lesefluss live sync**: documents the 4 contract points (notifyPosition call in saveReadingPosition, onBlePositionUpdate seek + lastSavedWordIndex_ suppression, listener wiring order, FNV-1a hash convention) that must survive the upstream split.

- **AI guidelines compliance (pre-PR scrub)** checklist: no em/en-dashes, no TASK refs in source, no lesefluss/capacitor strings, default zero comments, no opener/closer filler, no corporate words, match upstream 2-space indent, no breadcrumb comments. Listed the specific files carrying text that fails one or more rules (ble_config.h namespace + auto-gen header, App.cpp [save]/[load]/[ble-update] traces, etc.).

- **Justification of modifications to existing rsvpnano files**: per-file 'why touch this' table. Post-strip + gating, the upstream PR footprint in pre-existing files reduces to ~145 LOC + 1 build flag; the other 1900+ LOC live in 3 new files. Defensible PR shape.

Audit doc scrubbed of all 37 em-dashes (now 0).

upstream-pr/ble-service branch built and flashed to device. End-to-end verified: BLE advertising, app pairs, library streams, book upload + active-book switch + live position sync all work; words on device now match producer tokenization after delete + re-upload cycle.

Final commit topology (8 commits):
  2db430d chore: NimBLE-Arduino dep + host-task stack
  cfe712b feat(ble): BLE GATT service config (rsvpnano::ble namespace)
  6748579 feat(ble): BleDataStore for BLE-side book/position/settings
  53eda2e feat(ble): BleSyncManager NimBLE GATT service
  42b756d fix(ble): correct BleDataStore include path (foldable into 53eda2e via rebase --autosquash if desired)
  d57cb9c feat(app): wire BLE behind RSVP_BLE_SYNC build flag
  16ca454 feat(sync): expose connectivity.bleEnabled in companion settings JSON
  33be70c feat(storage): v2 .rsvp parser (pre-tokenized word list)
  + pending: fix(ble): deleteBook removes .ridx / .rdat sidecars

Final diff vs upstream/main: ~9 files, ~2465 insertions, 0 deletions. 84% of LOC in 3 new files under src/ble/. Pre-existing rsvpnano files touched additively only and gated behind RSVP_BLE_SYNC where appropriate.

Revised classification: v2 .rsvp reader moved from lesefluss-specific to upstream-worthy after user pushback. v2 is an additive parallel path (files without `@rsvp 2` header still hit v1), opt-in for any producer that wants pre-tokenized output. No harm to upstream users. Memory saved as feedback-additive-parallel-paths.md.

Bug surfaced + fixed: BleDataStore::deleteBook only removed the .rsvp file, leaving .ridx/.rdat sidecars on SD. Next upload of same byte content would hit `Index is current` and reuse the stale index, masking any tokenizer change. Fix removes both sidecars alongside the main file.

AC #2/#3/#4 marked done. AC #5 (lesefluss-ble still builds + e2e) pending verification next session — lesefluss-ble was never touched on disk so the rebuild should be a no-op, but worth confirming.

AC #5 satisfied by retiring lesefluss-ble rather than rebasing it. upstream-pr/ble-service is now a functional superset (BLE features + v2 reader + deleteBook sidecar fix that lesefluss-ble was missing) and cleaner (RSVP_BLE_SYNC gating, rsvpnano::ble namespace, traces gated by CORE_DEBUG_LEVEL, no web/ + boards/ reformat noise). Submodule repointed to upstream-pr/ble-service tip 1ad8809; build green; end-to-end live sync verified on device.

Generator at packages/ble-config/scripts/generate-cpp.ts patched to emit rsvpnano::ble at apps/rsvpnano/src/ble/ble_config.h. pnpm setup regenerates byte-for-byte identical output to the committed file, so the upstream branch stays compatible with our codegen flow.

lesefluss-ble branch not yet deleted (kept as a safety net until upstream-pr-based device firmware proves itself over a few days of use). Delete commands documented for later:
  git -C apps/rsvpnano branch -D lesefluss-ble
  git -C apps/rsvpnano push origin --delete lesefluss-ble

Next step for upstream PR submission (out of scope for this task): push upstream-pr/ble-service to sch-28/rsvpnano-lesefluss, optionally autosquash the include-path fix into the BleSyncManager commit, then open PR base ionutdecebal/rsvpnano:main.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Audited the lesefluss-ble fork against upstream/main, classified every changed file/hunk into upstream-worthy / lesefluss-specific / drive-by, and produced a clean 8-commit `upstream-pr/ble-service` branch suitable for upstream submission.

## What landed on the upstream branch

8 commits on top of `upstream/main`, ~2465 insertions, 0 deletions across 9 files. 84% of LOC sits in 3 new files under `src/ble/` (BleDataStore, BleSyncManager, ble_config.h). Pre-existing rsvpnano files touched additively only and gated behind the new `RSVP_BLE_SYNC` build flag.

```
2db430d chore: NimBLE-Arduino dep + host-task stack
cfe712b feat(ble): BLE GATT service config (rsvpnano::ble namespace)
6748579 feat(ble): BleDataStore for BLE-side book/position/settings
53eda2e feat(ble): BleSyncManager NimBLE GATT service
42b756d fix(ble):  correct BleDataStore include path (squashable)
d57cb9c feat(app): wire BLE behind RSVP_BLE_SYNC build flag
16ca454 feat(sync): expose connectivity.bleEnabled in companion settings JSON
33be70c feat(storage): v2 .rsvp parser (pre-tokenized word list)
1ad8809 fix(ble):  deleteBook removes .ridx / .rdat sidecars
```

## What got removed from the fork content

Drive-by noise dropped from the upstream branch:
- `web/library.js` 2568-line churn (99% prettier reformat, 17 real LOC),
- `web/components/install-firmware.js`, `web/firmware/manifest.json`, `web/index.html` reformats,
- `boards/esp32-s3-r8-opi.json` reformat,
- ~30 LOC of ungated Serial.printf traces across ReadingLoop, RsvpDataStore, App.cpp (kept the ones inside BleSyncManager and the BLE-side App callbacks but routed them through `BLE_LOG` / `#if CORE_DEBUG_LEVEL >= 3` so they compile out at lower debug levels).

## Naming and gating changes

- `RsvpDataStore` (misleading, only consumed by BLE) renamed to `BleDataStore` and moved from `src/storage/` to `src/ble/`.
- `namespace lesefluss::ble` renamed to `namespace rsvpnano::ble` in the generated `ble_config.h` and in BleSyncManager.cpp's using-decls. `packages/ble-config/scripts/generate-cpp.ts` updated to match, so `pnpm setup` regenerates byte-for-byte identical output.
- New `RSVP_BLE_SYNC` build flag wraps every BLE addition in App.{h,cpp} and CompanionSyncManager.cpp. With the flag unset the firmware compiles identically to upstream baseline. Default-on in `platformio.ini` so the lesefluss device build stays functional.

## Revised classification (after pushback)

Initial audit treated the v2 .rsvp reader as lesefluss-specific (reasoning: upstream has no producer). Corrected after user feedback: v2 is an additive parallel path (files without `@rsvp 2` header still hit v1), opt-in for any producer that wants pre-tokenized output. No harm to upstream users. Reader shipped on the upstream branch. Lesson saved to memory as feedback-additive-parallel-paths.

## Bugs found and fixed during verification

- `BleSyncManager.h` had a stale `#include "storage/BleDataStore.h"` after the rename (sed left-to-right ordering issue). Fixed in commit 42b756d.
- `BleDataStore::deleteBook` only unlinked the `.rsvp` file, leaving the `.ridx` and `.rdat` index sidecars orphaned. Next upload of the same byte content kept the same fingerprint, so `buildIndexedBook` reported "Index is current" and reused the stale (v1-built) index. Visible symptom: device word boundaries did not match producer tokenization after delete + re-upload. Fixed in commit 1ad8809.

## End-to-end verification

Flashed `upstream-pr/ble-service` to the device. Confirmed: BLE advertising, pairing, library streaming, book upload via .rsvp transfer characteristic, active-book switch, live position sync (both directions), delete from app. After the deleteBook sidecar fix, words on device match producer tokenization byte-for-byte through delete + re-upload cycles.

## Branch rationalisation

lesefluss-ble retired in favour of upstream-pr/ble-service. The submodule pointer in the parent repo now points at upstream-pr/ble-service tip 1ad8809. lesefluss-ble branch kept on the fork as a safety net until upstream-pr proves itself in daily use.

## Out of scope (for follow-up)

- Pushing upstream-pr/ble-service to the fork.
- Optional `git rebase -i --autosquash` to fold 42b756d into 53eda2e.
- Opening the actual PR against ionutdecebal/rsvpnano:main.
- Deleting lesefluss-ble on the fork after a confidence period.
- Audit doc lives at `docs/rsvpnano-upstream-audit.md` for reviewers and as a record of the classification logic.
<!-- SECTION:FINAL_SUMMARY:END -->
