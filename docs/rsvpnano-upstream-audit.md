# rsvpnano fork audit (lesefluss-ble vs upstream/main)

Source: `apps/rsvpnano` submodule, branch `lesefluss-ble` vs `upstream/main` (ionutdecebal/rsvpnano).

Covers TASK-146 AC #1.

## Diff at a glance

```
boards/esp32-s3-r8-opi.json        |   17 +-
platformio.ini                     |    3 +
src/app/App.cpp                    |  160 +++
src/app/App.h                      |   16 +
src/ble/ble_config.h               |   25 +
src/reader/ReadingLoop.cpp         |    6 +
src/storage/RsvpDataStore.cpp      |  809 ++++++++++++
src/storage/RsvpDataStore.h        |  111 ++
src/storage/StorageManager.cpp     |  246 ++++
src/sync/BleSyncManager.cpp        |  885 +++++++++++++
src/sync/BleSyncManager.h          |  139 ++
src/sync/CompanionSyncManager.cpp  |    8 +
web/components/install-firmware.js |  190 +-   (whitespace only)
web/firmware/manifest.json         |   44 +-   (whitespace only)
web/index.html                     |    4 +-   (cosmetic)
web/library.js                     | 2568 ++++   (99% whitespace; 17/21 LOC real)
```

Commits on branch (chronological):

```
40eb4d7 feat: added ble integration
fc1cd8e fix: upload issue
f28fcab fix: improved ble sync
634d16f feat: improved ble transfer and live sync
7264cda chore: config
a5ab42f feat: rsvp parser and listener
b2c0019 fix: sync issue
87cd75e feat: bi directional ble sync and ble toggle
```

## Risk to existing rsvpnano functionality

`git diff upstream/main...lesefluss-ble --shortstat -- src/` reports:

```
10 files changed, 2405 insertions(+), 0 deletions(-)
```

Zero deletions across the entire firmware source tree. Every change to an existing rsvpnano file is purely additive:

| File | + | - | What was added |
|---|---|---|---|
| `src/app/App.cpp` | 160 | 0 | New `begin()` block initialising RsvpDataStore + BleSyncManager; new `update()` line calling `bleSync_.update()`; new settings menu BLE toggle case; new methods `reconcileBleEnabled`, `onBlePositionUpdate`, `onBleActiveBookChange`; one extra call inside `saveReadingPosition` to push BLE position. No existing branch removed. |
| `src/app/App.h` | 16 | 0 | New includes, new member fields (`dataStore_`, `bleSync_`, `bleEnabledLastSeen_`), new method declarations. |
| `src/storage/StorageManager.cpp` | 246 | 0 | New `IndexedBuildContext` v2 state fields (defaulted off), new helper `emitV2WordRecord`, new function `processIndexedRsvpV2Line`, new 11-line short-circuit at top of `processIndexedRsvpLine` and 13-line v2-detection block inside `buildIndexedBook`. Legacy v1 tokenizer path untouched. |
| `src/reader/ReadingLoop.cpp` | 6 | 0 | Three `Serial.printf("[seek] ...")` traces inside `seekTo()`. Zero logic change. |
| `src/sync/CompanionSyncManager.cpp` | 8 | 0 | One new field in `settingsJson()` envelope (`connectivity.bleEnabled`) and a comment in `applySettingsJson()` documenting the deliberate skip. No existing settings field changed. |
| `platformio.ini` | 3 | 0 | NimBLE dep + host-task stack size flag. No existing flag removed. |

Conclusion: no upstream code path was removed or rewritten. Every existing rsvpnano feature (HTTP companion sync, USB MSC, SD library browser, OTA, reader loop, settings menu, RSS) still runs through its original code. The risk surface for an upstream maintainer is whether the additive hooks misbehave when BLE is disabled, which is addressed by the proposed `RSVP_BLE_SYNC` build flag (see below).

## Preservation of lesefluss live sync

Live position sync on lesefluss-ble currently works. The contract that must survive the upstream split:

1. `saveReadingPosition()` in `App.cpp` calls `bleSync_.notifyPosition(...)` after writing the local position. Both sides must stay; removing the notify breaks app-to-device push.
2. `onBlePositionUpdate()` in `App.cpp` seeks the reader and updates `lastSavedWordIndex_` to suppress the next save. Removing the suppression re-creates the unmount-double-fire issue (see also: the BookReader-side `userMovedRef` dirty flag in the capacitor app).
3. `bleSync_.setPositionListener` and `setActiveListener` wiring in `begin()` must run before `bleSync_.begin(...)`.
4. The hash convention: `RsvpDataStore::hashBookPath` (FNV-1a, 8-char lowercase hex) is also computed app-side. Both ends must use the same algorithm and casing.

These four points are upstream-worthy hunks and are already on the proposed upstream branch. They survive the split as long as the BLE feature ships as one cohesive commit set.

## AI guidelines compliance (pre-PR scrub)

The upstream PR title, description, commit messages, code comments, and any new identifier names must pass this checklist before submission:

1. **No em-dashes or en-dashes.** Use commas, periods, colons, or parentheses.
2. **No TASK-N references** anywhere in source files, commit messages, or PR text. Internal tracker IDs do not belong upstream.
3. **No `lesefluss` / `capacitor` strings** in any file destined for upstream (including comments). The upstream branch should read as standalone rsvpnano firmware.
4. **Default zero comments.** Strip every comment that narrates what the code does. Keep only comments that explain a non-obvious WHY (hidden constraint, workaround, surprising invariant).
5. **No opener filler** ("Certainly", "I'd be happy to", "Let me…") and **no trailing recap** in the PR description.
6. **No corporate words** (utilize / facilitate / regarding / leverage / commence / demonstrate). Use plain verbs.
7. **Match upstream code style:** existing rsvpnano uses 2-space indent, single Allman-ish brace placement matching Arduino style. Do not introduce prettier/biome reformats.
8. **No "removed", "old", or "deprecated" breadcrumb comments.** Just remove dead code.

Files to scrub before the upstream PR opens (all of these currently carry text that fails one or more rules above):

- `src/ble/ble_config.h`: header comment `Auto-generated from packages/ble-config/config-multibook.json` + `pnpm setup` reference + `namespace lesefluss::ble`. Re-author under a neutral namespace, drop the auto-gen note.
- `src/storage/RsvpDataStore.h` and `.cpp`: multi-line comments explaining HTTP-vs-BLE invariants are useful WHY context, keep. Comments that narrate WHAT (for example "8-char lowercase hex FNV-1a") can stay as one-liners. Watch for em-dashes.
- `src/sync/BleSyncManager.cpp`: several `Serial.printf` lines that double as comments are fine; the inline comments at lines 351, 610, 614 explaining acquire/release semantics are non-obvious WHY, keep.
- `src/app/App.cpp`: the multi-line comment above `saveReadingPosition` ("Invariant: currentBookPath_ always names...") is good WHY context, keep. Strip the `[save]`, `[load]`, `[ble-update]` debug traces.

## Classification

Three buckets: **U = upstream-worthy**, **L = lesefluss-specific**, **D = drive-by**.

### platformio.ini, U

```
+lib_deps =
+  h2zero/NimBLE-Arduino@^2.0.0
+  -DCONFIG_BT_NIMBLE_TASK_STACK_SIZE=8192
```

NimBLE dependency and host-task stack size. Required by any BLE PR.

### boards/esp32-s3-r8-opi.json, D

Pure prettier reformat (2-space to tab, array collapsing). No semantic change. Revert pre-PR.

### web/*, D (all)

- `web/library.js` 2568-line churn: `diff -w` shows 17 added / 21 deleted. Pure prettier reformat plus four trivial line-wrap changes. Not a BLE concern.
- `web/components/install-firmware.js` 190 lines: 100% reformat (tab indent, arrow fn).
- `web/firmware/manifest.json` 44 lines: 100% reformat.
- `web/index.html` 4 lines: `function ()` to `() =>` cosmetic.

Disposition: revert all of `web/` and `boards/` on the upstream PR branch. Either drop these reformats entirely or file a separate "apply prettier" PR upstream.

### src/ble/ble_config.h, L (rename to publish upstream)

New file, 25 LOC. Issues for upstream:

- Header comment `Auto-generated from packages/ble-config/config-multibook.json, pnpm setup` references lesefluss monorepo tooling.
- `namespace lesefluss::ble`.

Disposition: copy file into `upstream-pr/ble-service` branch under a neutral namespace (`namespace rsvpnano::ble` or `namespace ble`), drop the auto-gen comment, hand-author the constants. Keep the lesefluss-namespaced auto-generated copy in our overlay so the generator script stays valid. UUIDs themselves are stable contract: fine to publish.

### src/storage/RsvpDataStore.{h,cpp}, U (with small L tail)

Core data layer for both HTTP sync and BLE. Self-contained, no `lesefluss` strings. Uses upstream `/books`, `/books/books`, `/books/articles` paths and Preferences namespace. FNV-1a `hashBookPath` is firmware-internal.

Hunks:
- `BookEntry`, `StorageInfo`, `listBooks`, `hashBookPath`, `resolvePathByHash`, `read/writePosition`, `active/setActive`, `storage()`, atomic upload (`begin/append/finishUpload`), `deleteBook`, `settingsJson/applySettingsJson`, `bleEnabled/setBleEnabled`: **U**.
- `Serial.printf("[ds-write] ...")` at lines 437, 442: **D** trace. Strip on upstream branch.

### src/storage/StorageManager.cpp, L (candidate U if format documented)

+246 LOC = v2 `.rsvp` format reader (pre-tokenized word list). Bypasses local tokenizer; consumes `@rsvp 2` header + `@words N` / `@paragraphs M` / `@chapters K` count-prefixed blocks emitted by the lesefluss app's TS tokenizer.

Disposition: **lesefluss-specific by default**. Upstream has no producer for the v2 format. Two options:
1. Keep on `lesefluss-ble` only. The v1 tokenizer path still works for upstream users.
2. File a separate upstream proposal "v2 .rsvp file format" with the format spec plus this consumer. Out of scope for the BLE PR.

Recommend option 1 for the initial PR.

### src/sync/BleSyncManager.{h,cpp}, U (with D trace tail)

Core BLE GATT service implementation. 885 + 139 LOC.

Hunks (sample):
- NimBLE service + characteristic registration, advertising, connect/disconnect, MTU negotiation, library streaming with windowed chunks + ACK retries, position notify/coalesce, active-book write, settings R/W, storage info, delete, transfer: **U**.
- `using lesefluss::ble::*;` at lines 9 to 19: change to whatever namespace `ble_config.h` ends up using on the upstream branch.
- Operational logs (`[ble] advertising`, `[ble-xfer] notify->`, `[ble-lib] stream done`): **U** (useful first-PR logging; upstream maintainer can opt to gate behind `CORE_DEBUG_LEVEL`).
- Noisy per-op traces (`[ble-delete] hash=...`, `[ble-pos] write hash=...`, `[ble-active] open hash=...`, `[ble-pos] queued ...`, `[ble-lib] notify failed seq=...`): borderline. Recommend keeping at log level guarded by `CORE_DEBUG_LEVEL >= 3` macro.

Public listener API (`setPositionListener`, `setActiveListener`, `notifyPosition`, `applyActiveHash`): **U**.

### src/sync/CompanionSyncManager.cpp, U (gated)

+8 LOC: emits `connectivity.bleEnabled` in `settingsJson()` and a note that `applySettingsJson()` deliberately ignores the field (write goes through BLE settings char to avoid stale atomic cache).

Disposition: ship with BLE PR. The bleEnabled key is meaningful only if BLE is built in, so guard with `#ifdef RSVP_BLE_SYNC` (introduce flag on upstream PR).

### src/app/App.h, U (with build-flag gating)

+16 LOC: includes `RsvpDataStore.h` + `BleSyncManager.h`; member fields `dataStore_`, `bleSync_`; callbacks `onBlePositionUpdate`, `onBleActiveBookChange`, `reconcileBleEnabled`; flag `bleEnabledLastSeen_`.

Disposition: gate BLE members + callbacks behind `#ifdef RSVP_BLE_SYNC`. RsvpDataStore stays unconditional (HTTP companion also uses it).

### src/app/App.cpp, U (core) + D (verbose traces)

160 LOC across six hunks. Classification:

| Hunk | LOC | Class | Note |
|---|---|---|---|
| `kWifiSettingsBleToggleIndex` constants | ~5 | U | Settings menu plumbing for BLE toggle |
| `begin()`: dataStore + bleSync init, listener wiring | ~20 | U | `Serial.printf("[boot] ...")` are useful first-boot logs; keep |
| `update()`: `bleSync_.update()` + `reconcileBleEnabled()` | 2 | U | |
| `selectWifiSettingsItem` BLE toggle case | ~5 | U | |
| `reconcileBleEnabled()` body | ~25 | U | |
| `rebuildSettingsMenuItems` BLE row + bug-check | ~7 | U | one-shot guard print |
| `saveReadingPosition` `[save] entry` + `[save] SKIP` traces | ~6 | D | strip |
| `saveReadingPosition` `notifyPosition` BLE push | ~4 | U | required for live sync |
| `loadBookAtIndex` `[load]` trace | ~5 | D | strip |
| `onBlePositionUpdate` body | ~40 | U | keep; remove internal `[ble-update]` traces (~10 LOC) |
| `onBleActiveBookChange` body | (below cut) | U | |

Gate the BLE branches with `#ifdef RSVP_BLE_SYNC`.

### src/reader/ReadingLoop.cpp, D

+6 LOC = three `Serial.printf("[seek] ...")` traces. Revert on upstream branch.

## Drive-by tally

- `boards/esp32-s3-r8-opi.json`, reformat, revert.
- `web/library.js`, reformat (1282/1286 ws), revert.
- `web/components/install-firmware.js`, reformat, revert.
- `web/firmware/manifest.json`, reformat, revert.
- `web/index.html`, cosmetic arrow fn, revert.
- `src/reader/ReadingLoop.cpp`, seek traces, revert.
- `src/app/App.cpp`, `[save]` / `[load]` / `[ble-update]` traces, strip.
- `src/storage/RsvpDataStore.cpp`, `[ds-write]` traces, strip.

Total drive-by: ~30 LOC of trace logs across firmware plus the web/boards reformat noise.

## Lesefluss-specific tally

- `src/ble/ble_config.h` namespace + auto-gen comment: re-author under `rsvpnano::ble` on upstream branch; keep the generated lesefluss copy in our overlay only.
- `src/storage/StorageManager.cpp` v2 `.rsvp` reader: keep on `lesefluss-ble` only.
- Build flag `RSVP_BLE_SYNC`: proposed new macro to gate BLE members in `App.{h,cpp}` and the `connectivity.bleEnabled` settings JSON line.

Overlay path proposal: `apps/rsvpnano/lesefluss/` is not needed. The only lesefluss-only firmware code is the v2 reader inside `StorageManager.cpp`. Cleaner to keep it inline on `lesefluss-ble` only and never propagate to `upstream-pr/ble-service`.

## Proposed branch topology

```
upstream/main
   └── upstream-pr/ble-service   (clean, squashable commits below)
        1. build: add NimBLE-Arduino dep + host-task stack
        2. feat(ble): ble_config.h with rsvpnano::ble namespace and UUIDs
        3. feat(storage): RsvpDataStore shared data layer (FNV-1a hash, NVS-backed positions, atomic upload, deleteBook, settingsJson)
        4. feat(ble): BleSyncManager GATT service (library/active/position/transfer/settings/storage/delete chars, windowed chunks, ACK retries)
        5. feat(app): wire RSVP_BLE_SYNC build flag, BLE init, settings toggle, position listener
        6. feat(sync): emit connectivity.bleEnabled in companion settings JSON (gated)

lesefluss-ble  (no rebase, keep as today)
   ├── everything in upstream-pr/ble-service
   ├── apps/rsvpnano: v2 .rsvp reader in StorageManager.cpp
   ├── ble_config.h regenerated from packages/ble-config under lesefluss::ble
   └── debug trace logs across ReadingLoop / App / RsvpDataStore
```

## Justification of modifications to existing rsvpnano files

For the upstream maintainer, the question "why touch these files at all" needs a clean answer:

| File | Modification | Justification |
|---|---|---|
| `platformio.ini` | +NimBLE dep, +stack size flag | Unavoidable. Project-level dependency declaration for the BLE library. |
| `src/app/App.h` | +includes, +members, +callbacks | The application owner needs to construct, update, and route events from the BLE manager. Cannot live in a separate file without dependency inversion. Gated by build flag. |
| `src/app/App.cpp` | +init, +update tick, +settings toggle, +callbacks, +position push hook | Same as above. The single hook inside `saveReadingPosition` is a one-line notify call. Gated by build flag. |
| `src/sync/CompanionSyncManager.cpp` | +1 settings JSON field | Lets HTTP companion clients discover whether BLE is on. Eight lines, gated by build flag. |
| `src/reader/ReadingLoop.cpp` | +3 traces | Drive-by, revert. |
| `src/storage/StorageManager.cpp` | +v2 reader | Lesefluss-only, not in upstream PR. |

After the trace strips and the `RSVP_BLE_SYNC` gating, the upstream PR's footprint in pre-existing files reduces to: 1 line in platformio.ini's `lib_deps`, 1 build flag, ~15 lines in `App.h`, ~120 lines in `App.cpp`, 8 lines in `CompanionSyncManager.cpp`. Everything else (over 1900 LOC) lives in three new files (`RsvpDataStore.{cpp,h}`, `BleSyncManager.{cpp,h}`, `ble_config.h`). That is a defensible PR shape.

## Disposition summary per AC

- **AC #1** done: this doc.
- **AC #2** to do: create `upstream-pr/ble-service` branch via the commit topology above; firmware build green on that branch.
- **AC #3** to do: rename namespace in `ble_config.h`, introduce `RSVP_BLE_SYNC` flag, gate App + CompanionSyncManager BLE hunks behind it.
- **AC #4** to do: drive-by reformats reverted on upstream branch; trace logs stripped or moved behind `CORE_DEBUG_LEVEL` macro. Web reformat optionally proposed as separate PR.
- **AC #5** to do: rebase verification on `lesefluss-ble` after the split.

## Open questions for the next session

1. Does upstream maintainer want logs gated by `CORE_DEBUG_LEVEL` or simply removed?
2. Build flag naming: `RSVP_BLE_SYNC` vs upstream-preferred (for example `RSVPNANO_BLE`)?
3. Should the v2 `.rsvp` reader be filed as a separate upstream proposal alongside the BLE PR, or held entirely?
4. Web/boards reformat: file as separate "apply prettier" PR or drop?
