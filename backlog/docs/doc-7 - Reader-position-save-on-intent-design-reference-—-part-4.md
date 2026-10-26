---
id: doc-7
title: 'Reader position: save-on-intent design (reference) — part 4'
type: specification
created_date: '2026-10-26 03:15'
tags:
  - reader
  - position
  - TASK-206
---
> Status (2026-10-26): REFERENCE ONLY, not scheduled. Owner chose targeted fixes for the 6 confirmed position bugs (TASK-206 subtasks) instead of this full refactor. Reviewed over 3 rounds by independent agents.
> Part 4 of 4. Parts: doc-4 (§1-6: problem, decisions, architecture, register, writer, gate), doc-5 (§7-13: intent, non-intent, page mode, owners, externals, lifecycle, durability), doc-6 (§14-17: content changes, constants, guard removal, case matrix), doc-7 (§18-23: harness, telemetry, alternatives, subtasks, risks, review response).

## 18. Test harness

1. **1 fps BeginFrameControl lane** (the primary reproduction for late-shift rows, established in 206.1).
   - **Setup:**
     - `chromium.launchPersistentContext` with `--enable-begin-frame-control` and `--run-all-compositor-stages-before-draw`;
     - the page is created through CDP `Target.createTarget({ enableBeginFrameControl: true })`;
     - a pump drives `HeadlessExperimental.beginFrame` at a configurable rate (default 1 Hz).
   - **Cost and size:** CI-capable, about 1.5-3 min per case, so the lane stays lean. Rows: L2, C7, N7, I6, plus one page-mode reopen (L2p) and one relayout row (N1). Everything else runs at the normal frame rate.
   - **Procedure:** TOC jump → Read from here → save; then ×5 in-app back/reopen with idle frames, and ×5 `page.goto`, asserting the DB word and the save count.
   - **Fixtures:** the uniform big-book fixture reproduces the drift. `e2e/helpers/novel-book.ts` (one chapter, about 2500 paragraphs from a seeded PRNG: 65 % 8-30 words, 30 % 80-200, 5 % 400-900; a nav point near word 45k) is kept as a variant (C7).
2. **Hooks**, enabled when `import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS`:
   - `__lesefluss_e2e_saveLog`, append-only `{bookId, word, rev, source, kind: persist|pending|mirror|applied|conflict|observed|adopt|keep|drop|aim}`. The `count` field is kept for old specs.
   - `readBookPosition` / `setBookPosition` (through the register).
   - `applyRemoteBook` (the real merge), `emitDevicePosition`, `remountReader`, `invalidateBooks`, `gate()` snapshot.
   - Fake read-aloud (a localStorage flag overriding `IS_READ_ALOUD_SUPPORTED`) on a fake clock, with fake native records and event-order control (for I14h).
   - A fake `PositionMirror` backed by IndexedDB.
   - **There is no user-scroll hook.** Intent specs use real input: `mouse.wheel`, `Input.dispatchTouchEvent`, `keyboard.press`, mouse drags on the scrollbar. Raw `scrollTop` writes are used only for foreign rows. The existing `scrollTop`-based helpers (`position-end-of-book.spec.ts`, `position-settle-paragraph-start.spec.ts`) migrate to real input **in 206.2**, because the post-open hold ignores raw `scrollTop` writes.
3. **Injectors:**
   - `nudgeScrollTop(±1)`;
   - `resizeItemAbove(n, px)` with fractional px;
   - `resizeItemCutByTop(px)`;
   - `injectLateFigure`, `growImageInCutItem`, `removeFigure`;
   - `swapFontFace`;
   - `insertDiscussionMarker`;
   - a stall injector (busy loop in rAF).
4. **Geometry and timing:**
   - fractional CSS geometry (27.3 px line height, 17.5 px font, 13.7 px margins), plus one DPR 2.625 smoke;
   - CDP `Emulation.setCPUThrottlingRate` 4-6.
5. **Touch:** a Pixel 7 project (`hasTouch`, `isMobile`) driven by raw `Input.dispatchTouchEvent` (start, 10 moves of 50 px at 8 ms, end). `synthesizeScrollGesture` with touch is inert in Chromium 148.
6. **Properties:** fast-check (devDependency), about 2k runs by default, `PROPERTY_RUNS` to raise it; failures print the seed and the shrunk sequence.
7. **`knownBug(id, fn)`:** expects a typed `PositionAssertionError` and rethrows anything else, so a timeout never counts as "still red".
8. **Golden save-log baseline:** 206.3 records every existing spec's save log to `e2e/__golden__/*.json`. Each subtask lists the case ids whose diffs are allowed; any other diff fails.
9. **SQL tests:** Node SQLite (better-sqlite3, devDependency) runs the same SQL strings as §4. Web jeep-sqlite runs in e2e; Android runs in the device lane.
10. **Device lane:**
    - Playwright `_android` against the debug APK (`device.webView({pkg:"app.lesefluss"})`), after `pnpm run sync`.
    - The DB and shared_prefs are read via `adb run-as`; a `VITE_E2E_HOOKS=1` build is optional for save logs.
    - Scripts: AC#5 five reopens; swipe flings and touchcancel (notification shade); force-stop timings (L16); read-aloud screen-off (I14d).
    - Manual checklist: TalkBack (I18c), Boox pen, OS font scale, soft keyboard, real BLE.
11. **e2e-app lane:** two contexts against the real server for N10 and N10h.

---

## 19. Telemetry

| Event | Payload | Purpose |
|---|---|---|
| `reopen_drift` | `topVisibleWord − seedWord` (words), DPR, mode, engine version; after the initial aiming phase | AC#5 in the field |
| `position_commit_summary` | per-source counts on unmount (scroll, foreign-scroll, tap, jump, page-turn, rsvp, tts, adopt, keep, conflict, remap, reconcile) | the attribution mix |
| `position_foreign_commit` | displacement | backstop tuning |
| `position_rev_regression` | word, revs, origin | assertion: a bypass writer exists |
| `position_conflict_loop` | revs | assertion |
| `position_remap_fallback` | – | text-anchor misses |
| `db_nested_unit` | – | assertion |
| existing `position_write_timeout`, `db_write_error` | – | kept |
| `position_flush_skipped` | – | retired |

---

## 20. Alternatives considered

| Alternative | Verdict |
|---|---|
| Guards + content `hasMoved` + slack only | Shipped as the 206.2 hotfix and kept as parts. As the end state it still fails open, and does nothing for re-stamps, sync, RSVP, page mode or durability. |
| Displacement-only classification (no windows) | Can't separate intent from layout. Kept only as the foreign backstop. |
| Windows without re-aim | Correct (G4), but relayout and jumps need aiming. **Chosen:** windows + bounded aiming phases. |
| Steady-state re-aim (v1) | Fights momentum tails, TalkBack and virtua. Cut. |
| Native `scrollend` only / platform attribution | No attribution API exists. Native `scrollend` is used where available, with our own debounce otherwise. |
| Persist an offset / CFI | Device-specific; not needed. |
| Replace virtua | Large; reflow sources remain anyway. |
| Refs inside BookReader | Not property-testable. |
| Write-time stamps | Late flushes beat newer externals. Monotonic `stampFor` instead. |
| Event-sourced position log | Over-engineered for the same guarantees. |
| CSS `overflow-anchor` / `content-visibility` | Too much DOM for e-ink; the gate is needed anyway. |
| Wall-clock adopt rule | Breaks under skew. Causality (seq + hidden) instead. |
| Per-instance write queue | Dies with dispose. Module-level writer instead. |
| Two CAS forms (`<=` gate, `<` externals) | One monotonic register. |
| Split pull statements | Not atomic. One statement with per-group guards instead. |
| `changes` pass-through | Engine-dependent. Read-back in the same unit instead. |
| Undo through the writer after unmount | Would move a closed book from a forgotten toast. Toasts are dismissed on unmount instead. |
| Cold-start "not newer until the first pull" | The inverse toast already prevents silent loss (D13). |
| Pause hold / wake lock / write priority | Doesn't stop the freezer or swipe-kill; adds adapter risk. The native mirror instead. |
| Global figure page lookup (`findPageForWord` maps a paragraph start to its figure page) | Regresses jumps, follow, relayout and aliasing. The device-local hint instead (D10). |
| Persisted figure index (schema + sync) | Unnecessary with the hint. |
| Reader-only tab lock | Whole-DB snapshots mean any tab clobbers. Whole-app lock instead. |
| BroadcastChannel heartbeat election | Web Locks exist everywhere we support. |
| `contentRevision` column for the fingerprint | Local-only and leaves mismatches unresolved. Local units at the merge plus scaling instead. |

---

## 21. Subtasks (paste-ready)

Every subtask:
- passes tsc, vitest, biome, the full `pnpm e2e` and `vite build`;
- keeps the golden save-log diff to its listed rows;
- has independent review;
- has its owned rows (§17) green, with no `knownBug` left for them.

**Order:** 206.1 → 206.2 → 206.3 → 206.4 → 206.5 → 206.6a → 206.6b → 206.6c → 206.7 → 206.8 → 206.9 → 206.10, then 206.11-206.16 (respecting the listed dependencies), then 206.17.

**Order safety:**
- No step introduces a loss race that exists neither today nor at the end state.
- The register and the merge (206.5) land before re-stamping is removed (206.6a).
- The adopt rules (206.7) land right after the gate.
- Windows ship together with the foreign backstop (206.8).

### 206.1 Repro gate (done in substance; results in the TASK-206 notes)
- **Scope:**
  - novel fixture;
  - save log with a source tag at today's call sites;
  - DB read hook;
  - the experiment matrix ({uniform, novel} × {headless-shell, chromium, headed chrome} × {CPU 1×, 4×}, plus a low-frame-rate probe).
- **Result:**
  - the fixture hypothesis is refuted;
  - the drift reproduces only at about 1 fps, deterministically with CDP BeginFrameControl;
  - the mechanism is in §1.1.
- **ACs:**
  - [x] Fixture committed; matrix and mechanism recorded in the notes.
  - [x] Decision recorded: late-shift rows run in the 1 fps BeginFrameControl lane (§18.1) in CI; the novel fixture is a variant.
  - [ ] Still to record, if missing from the notes (otherwise 206.8 measures them first): whether native `scrollend` fires mid-fling after compensation and the resulting `TAIL_MS` check; headless `Page.setWebLifecycleState` freeze feasibility.
- **Depends on:** –

### 206.2 Hotfix: post-open hold + frame-aware stability + slack + content hasMoved (D7)
- **Scope:**
  - **Post-open hold.** At `markInitialSettled`, start the existing relayout hook (`useRelayoutAnchor.start`) anchored to the seed word. It holds until real input:
    - wheel, touchmove, keys via `handle.scrollBy`, `jumpTo`;
    - **any** pointerdown in the container, so overlay scrollbars are covered too.

    While held, `handleScrollEnd` and the tick path save nothing (the existing `isPending` checks), and late virtua shifts are re-aimed to the seed.
  - **Frame-aware stability.**
    - `scheduleFineScroll` samples `scrollHeight` and the target offset in rAF and requires `SETTLE_FRAMES` unchanged frames, with `FINE_SCROLL_CAP_MS` as a cap;
    - the hook's quiet becomes `SETTLE_FRAMES` frames + `QUIET_MS`;
    - `INIT_SETTLE_COOLDOWN_MS` becomes moot under the hold.
  - §8.4 slack in `topVisibleWord` and `isOnTopEdge`.
  - §8.2 content-based `hasMoved` in `handleScrollEnd`.
  - Migrate the raw-`scrollTop` user-scroll helpers to real input (wheel, keyboard).
- **ACs:**
  - [ ] L2 is red before and green after in the 1 fps lane.
  - [ ] L2n, N7 (both rates) and N8 are green.
  - [ ] A 5-reopen real-Chrome Morning Star check leaves the DB word unchanged.
  - [ ] An input right after open (wheel, key, scrollbar pointerdown) is saved (I1, I3, I4 smoke).
  - [ ] The migrated specs and the full suite are green.
- **Depends on:** 206.1

### 206.3 Harness
- **Scope:** §18.2-18.8 and 18.10 setup; the matrix as `knownBug` specs tagged with owner subtasks.
- **ACs:**
  - [ ] All hooks and injectors listed in §18 exist.
  - [ ] The touch project, CPU throttle and fractional CSS are available.
  - [ ] `knownBug` is in place.
  - [ ] The golden baseline is recorded for every existing spec.
  - [ ] Every §17 row exists as a spec or unit stub with its owner id.
  - [ ] No user-scroll hook exists.
- **Depends on:** 206.2

### 206.4 Pure models: gate, writer core, intent-window reducer
- **Scope:**
  - `pages/reader/position/model.ts` (§6);
  - the pure core of `services/position/writer.ts` (§5, without I/O);
  - `pages/reader/position/intent-window.ts` (§7.1);
  - reconcile decision logic (§12.4).
  - **Nothing is wired yet.**
- **ACs:**
  - [ ] P1-P12 and W1-W10 pass with fast-check.
  - [ ] There is a unit row for every API entry in §6.2, every rule in §11.2-11.3, and every §10.3 transition (I21).
- **Depends on:** 206.3

### 206.5 Register for every position writer + writer shell + pull merge
- **Scope:**
  - `adapter.runUnit` with raw conn, explicit transaction and the nested-enqueue assertion;
  - `writePositionCas`, `mergeServerBook` (local units), `readPosition`;
  - the `updateBook` type split, the Biome boundary and the tripwire;
  - the writer shell (§5) with localStorage pending;
  - `BookReader.writePosition` delegates to `writer.persist` with **today's re-stamping semantics**;
  - sync pull, BLE (multi and single) and book-detail go through the register or the writer;
  - conflicts use the §11.3 interim (LWW, no toast);
  - telemetry for `position_rev_regression`.
- **ACs:**
  - [ ] Rows L11f, L11g, L16b (U), L20, L21, L22, I9, N10g, N22 are green.
  - [ ] The golden diff shows only conflict logging.
  - [ ] SQL tests pass on Node SQLite, jeep-sqlite and Android.
- **Depends on:** 206.4

### 206.6a Gate wiring and no re-stamp
- **Scope:**
  - **Wire the gate into BookReader:** `use-position-gate.ts` runs the model.
  - Move **every save call site** onto gate calls:
    - `handleScrollPositionSettle` → `commit("scroll")`, via today's settle path until 206.8;
    - `handleWordTap` → `commit("tap")`;
    - `jumpToWord` / `navigateToWord` / scrub → `commit("jump")`;
    - `handleRsvpPositionChange` → `note`;
    - `exitRsvpToStandard` → `setOwner`;
    - `handleSaveSpokenWord` / `handleSpokenWord` → `note` / `persistDue`;
    - `use-scrub-progress` RSVP → `note`;
    - pending recovery → seed;
    - both flushes → `gate.flush()`.
  - Gate-local `dirty`; `stampFor` with `maxSeenRev`; pending written at emit (localStorage until 206.14); remove re-stamping.
  - The mode remount uses `gate.intent.word`.
  - **Interim owners**, so no producer is dropped before 206.12/206.15:
    - `handleRsvpToggle` entering RSVP calls `setOwner({rsvp, token})`, with a fresh token per RsvpView mount, and `exitRsvpToStandard` calls `setOwner(view)`;
    - while today's read-aloud owns the position (`readAloud.status !== "off"`), the owner is `{tts, sessionId}`, set on start and returned to view on `"off"` (206.15 narrows this to playing-and-followed);
    - ScrollView and PageView call `registerView` with a fresh token per mount.
- **ACs:**
  - [ ] Rows L7, L10, L11b, L11e, M4, I5, I7, I8, I10 (standard), N10i, C6 are green.
  - [ ] RSVP and read-aloud progress persist as today: the golden save-log diff is empty for the RSVP and read-aloud specs, and M1, M2, M6 and I15 (existing behaviour) stay green.
  - [ ] No reader module calls `writePosition` or `savePosition` directly (tripwire).
- **Depends on:** 206.5

### 206.6b Seeds
- **Scope:**
  - render-time seed (max-by-rev of the loader row, `writer.known` and pending) plus the clamp;
  - `positionsReady` awaited by the route loader (resolving immediately until 206.10 adds reconcile);
  - detail-cache update in the writer; conditional pending clear.
- **ACs:**
  - [ ] Rows L1, L5b, L11, L11c, L11d, L13, L14, N13c are green.
- **Depends on:** 206.6a

### 206.6c Browse inside the gate
- **Scope:**
  - `hold(anchor)`, `release`, `back`, `autoCommit`, `toastAction`, the detectors before persist, `dismissToasts`;
  - owner tokens: `registerView` per mount, `setOwner(view)` with the mounted token;
  - the `advanceChapter` latch;
  - `BrowseController` absorbed.
- **ACs:**
  - [ ] Rows I6 (the read-from-here word), I11, I12 (scroll), I12b, I12c, M10 are green.
- **Depends on:** 206.6b

### 206.7 External rules and adopt UX
- **Scope:**
  - §11.2 rules 1-6 and §11.3 conflicts, replacing the interim;
  - adopt and Go-there toasts with replacement (D11);
  - BLE: silent, no push back, compares against the gate or writer, awaits `positionsReady`;
  - BookReader takes externals only from writer events;
  - `commitChapter` becomes device-local (D6).
- **ACs:**
  - [ ] Rows N10, N10b-f, N10h, N10j-q, N16, N17, I16 (scroll), I16b-d are green.
  - [ ] The e2e-app smoke passes.
- **Depends on:** 206.6c

### 206.8 Intent windows + foreign backstop + telemetry
- **Scope:**
  - `use-intent-window` with the reducer: own close detector, pressed tracking, deferred commit and tail, anchor baseline, timeouts, checkpoint, re-arm;
  - settles flow only through windows (today's settle path is retired);
  - display-only ticks;
  - the foreign backstop;
  - `reopen_drift` and the commit summary;
- **ACs:**
  - [ ] Rows L2 (windows), L17, I1-I2m, I3-I3c, I4-I4d, I6b, I6c, I13, I17 (scroll), I18, I18b, N9, N10e (gesture), N15, N18, N20, C4, C7 are green.
  - [ ] The TalkBack device check (I18c) is recorded.
  - [ ] The 205.8 specs are green.
- **Depends on:** 206.7

### 206.9 Aiming phases + ceiling anchors
- **Scope:**
  - `use-view-anchor` (§8.1) with all triggers;
  - the `AIM_SETTLE_MS` end; no idle re-aim;
  - `firstRenderedWord` for the jump heading check, `findAlignmentSpan` and the heading mode (§8.3).
- **ACs:**
  - [ ] Rows I6 (landing, real Chrome Morning Star), L3, N1 (scroll), N1b, N2 (scroll), N3-N6 (scroll), N7 (view), N11, N12, C1, C2 (scroll), C3, C5 are green.
- **Depends on:** 206.8

### 206.10 Flush, lifecycle, app-start reconcile
- **Scope:**
  - the layout-cleanup flush (idempotent, re-armable), passive dispose, ScrollView's own cleanup commit;
  - `drain` → `pushSync` → invalidate;
  - the unmeasurable fallback; the flush resolves `pendingExternal`; Fast Refresh revive;
  - the RSVP `pagehide` flush deleted;
  - app-start reconcile (§12.4) of localStorage pending, with the timeout, the `missing` outcome, BLE and book-detail gating, and `storage`-event reconcile.
- **ACs:**
  - [ ] Rows L5, L6, L6b, L8, L9, L10b, L12, L15, L18, L19 (web), L19b-e, M8 are green.
- **Depends on:** 206.9

### 206.11 Page mode ◆
- **Scope:**
  - §9.1;
  - §9.2 figure hint (`data-figure-id`, `data-figure-anchor` with the ceiling, `readFirstFigureOnPage`, the hint store, lander and relayout use, no `advanceChapter` for trailing figures);
  - removal of the page-mode jump guard.
- **ACs:**
  - [ ] Rows L2p, I3d, I12 (page), I16 (page), I17 (page), N1 (page), N2 (page), N6 (page), C2 (page), C3p, C3p2, C3p3, C3q, C3r, C6 (page) are green.
- **Depends on:** 206.10

### 206.12 RSVP owner ◆
- **Scope:** §10.2: owner token, `note`/`persistDue`, pause on the same word writes nothing, identity-only changes keep the index, the fallback index stays silent, scrub windows, `setOwner` releases browse and calls `persistDue`.
- **ACs:**
  - [ ] Rows M1-M3, M5-M7, I10 (RSVP), I15, I24, N13, N13d, N14 are green.
- **Depends on:** 206.10

### 206.13 Content remap and swap writers ◆
- **Scope:** §14: the fingerprint, the writer's per-book swap lock (`beginSwap`/`endSwap`), `gate.remap`, swap writers (text-anchor map, one `runUnit` with `writeLongText` and the CAS position), and the flush scaling of mismatched pending externals.
- **ACs:**
  - [ ] Rows N13b and N13e are green.
  - [ ] Unit tests cover the text-anchor map (shifted bytes, no match → proportional + telemetry).
- **Depends on:** 206.10

### 206.14 Android kill durability ◆
- **Scope:**
  - the `PositionMirror` plugin (`commit()`, max rev per book, `getAll`, `clearIfAtMost`), posted before the DB write;
  - reconcile includes mirror entries;
  - `resetAppData` clears the mirror.
- **ACs:**
  - [ ] Rows L16, L16b (D), L19 (D), L19f are green.
  - [ ] If L16 fails, the synchronous `@JavascriptInterface` fallback is implemented and L16 passes.
- **Depends on:** 206.10

### 206.15 Read-aloud owner and native record ◆
- **Scope:**
  - the §10.3 transition table;
  - `nativeRecord` as the single entry point;
  - `followHeld`;
  - native events carry `{word, rev, sessionId}`;
  - the wire format (§10.4) and the `TtsPlayer.Segment` arrays;
  - the native record via `PositionMirror` (max rev);
  - fake read-aloud specs.
- **ACs:**
  - [ ] Rows M9, I14-I14h, I19-I23, I25, N13f are green.
- **Depends on:** 206.12, 206.14

### 206.16 Web single DB-writer tab ◆ (L)
- **Scope:** §13.2: the lock gating bootstrap, the fence before every write and save, explicit `saveToStore`, the TOCTOU-safe pending clear, takeover and steal, the "Lesefluss is open in another tab" / "Use here" screen.
- **ACs:**
  - [ ] Rows N19, N19b, N19c are green.
- **Depends on:** 206.10

### 206.17 Guard removal + mutation runner + full matrix
- **Scope:**
  - delete everything marked removed or replaced in §16;
  - `scripts/position-mutations/*.patch` plus a guard → spec mapping file in the repo; the runner applies each patch, requires the mapped specs to go red, and reverts it.
- **ACs:**
  - [ ] Every mutation goes red.
  - [ ] **Every §17 row is green, with no `knownBug` remaining.**
  - [ ] The AC#5 device lane passes (5 reopens in real Chrome and on the Pixel).
  - [ ] The Android build succeeds.
  - [ ] The full suite is green.
- **Depends on:** 206.11-206.16

---

## 22. Risks and rollback

**Risks:**
- *Aiming fights virtua.* Phases are bounded and must hold on target before ending, with a cap. By G4, the fallback is to shrink the triggers back to the 205.8 set.
- *Unattributed input.* Covered by the foreign backstop, the checkpoint, telemetry and the device checklist.
- *Frame-counted settling is slow at low frame rates.* At 1 fps a window closes or a landing settles after a few seconds. That is a latency cost only: saves never depend on wall-clock timing, and the caps are logged.
- *The 206.2 post-open hold until input* could miss an input route the hook doesn't hear. It hands back on any pointerdown, wheel, touchmove, `scrollBy` or `jumpTo`, and the I1/I3/I4 smoke rows guard it.
- *React cleanup ordering.* Confirmed for React 19.2. Idempotence and re-arm cover Activity/Suspense; an H test pins the ordering against a React upgrade.
- *Register behaviour change in sync.* 206.5 keeps today's semantics apart from the conflict outcome, which matches today (§11.3).
- *The native work* (206.14, 206.15) is Android-only, and the web fallbacks don't change.
- *The multi-tab change is visible to users,* so it is its own step and can be reverted.
- *Adopt is a visible jump,* but it is deferred while the reader is active and can be undone.
- *The TOC landing hypothesis* (§8.3) could be wrong. I6 in real Chrome decides; if it is, 206.9 keeps the ceiling fix (still correct for figures and headings) and investigates further.

**Rollback:**
- 206.2 reverts on its own.
- 206.5 through 206.7 revert as a chain.
- 206.8 reverts to the 206.7 state, i.e. the old settle path through the gate.
- 206.9 falls back to the 205.8 hold.
- 206.11-206.16 each revert on their own.
- 206.17 is deletion only.

---

## 23. Review response (round 3)

### Audit
| Id | Resolution |
|---|---|
| A1 reconcile reverses E3 | §12.4: `writePositionCas` with no bump; clear when `row.rev ≥ entry.rev`; `missing` outcome; L19b, P12 |
| A2 flush rules | §6.2 `flush`: rules 1, 2, 4, 5, 6; mismatch scaled at flush (§14.2); L18 |
| A3 read-aloud holes (a-e) | §10.3 table: pause while detached (a, I14e), Back to voice note first (b, I14f), native record while detached → `followHeld` (c, I14g), dead session → `setOwner(view)` first (d, I23), `followHeld` in the API with the voice stamp (e, §6.2) |
| A4 setOwner token | §6.2 `registerView`, `setOwner(view)` uses the mounted token; M10 |
| A5 reconcile timeout | §12.4 `RECONCILE_TIMEOUT_MS`, outside `initDb`, `positionsReady` always resolves; L19d |
| A6 §4.5 overreach | Replaced by the device-local figure hint (D10, §9.2); `findPageForWord` unchanged |
| A7 fingerprint | §14.1 exact definition; §4.3 pull in local units with scaling; `:wc` no longer written |
| A8 rows without owners | §17 Owner column on every row; 206.17 requires all rows green with no `knownBug` |
| A9 subtasks not paste-ready (a-d) | §21: scope lines (206.4 not wired; 206.6a wires the gate and moves each named call site) (a); this document is the AC#1 backlog document (b); "localStorage until 206.14" (c); N10o for O3 replacement (d) |
| A10 lastConflict | §5.1 conflict `seq`; §6.2 `lastConflictSeq`; P10 |
| A11 ack matching | §6.1 ack matching (origin gateId + emitted word, `maxByRev`); writer dedupe defined (§5.2) |
| A12 rule-6 aim under a non-view owner | §11.2 rule 6(b) aims only when owner = view; §11.3 keep under a non-view owner; N10q |
| A13 206.5 interim and bypass writers | §11.3 interim note; §3 accepted bypass writers (inserts, tombstones); N22 excludes them |
| A14 small points | deferred commit applied on owner change (§7.1); I10 restated with the checkpoint (§6.3); C3p marked changed (§17); toast actions are gate-internal with the current view token (§6.2); `persistDue` on a read-aloud jump (§10.3) |
| A15 line refs | Symbol names throughout |

### Red team
| Id | Resolution |
|---|---|
| H1 event order loses screen-off progress | §6.2 `nativeRecord` as the single entry point, applied first by every transition (§10.3); native events carry `{word, rev, sessionId}` (§10.4); mirror keeps the max rev; I14h |
| H2 floor anchors | §8.3 `firstRenderedWord` (ceiling) for figure anchors, the jump heading check and `findAlignmentSpan`; the TOC-landing note is explained and folded in; C3r, I6 |
| H3 global figure rule regression | Owner-approved hint (D10, §9.2) |
| H4 stale seed snapshot | §12.1 render-time max-by-rev of the loader row, `writer.known` and pending; L5b |
| M1 snapshot source | §5.1 `Origin` on every event; BookReader takes externals only from writer events (§5.4); I16d |
| M2 jumps stamp `finished_at` | §4.2 `stampFinished` flag |
| M3 fingerprint holds forever | §4.3 local units + scaling at the merge; §14.2 scaling at flush and for the native record; bounded |
| M4 reconcile failure modes | §12.4 best-effort, time-boxed, outside `initDb`, `missing` outcome, BLE and book-detail gated on `positionsReady`, `resetAppData` clears the mirror; L19c-f |
| M5 swap transaction / deadlock | §4.1 `runUnit` with raw conn + BEGIN/COMMIT + `writeLongText` + the nested-enqueue assertion; §14.3; L22 |
| M6 resume while detached and paused | §10.3: PausedDetached keeps held; resume continues at held; O4 applies only to a non-browse move (D12); I14e, I25 |
| L1 ack regression | `maxByRev` (§5.3, §6.1) |
| L2 Go-there for superseded deferred externals | §6.2 `commit` step 5; N10p |
| L3 stuck press | §7.1 checkpoint commit; I2m, W9 |
| L4 superseded entries | §5.4 `observe` clears entries with rev ≤ row.rev; reconcile never re-stamps (P12) |
| L5 web fence TOCTOU | §13.2 clear only after `saveToStore` + fence re-check; `STEAL_SETTLE_MS`; `storage`-event reconcile; N19c |
| L6 first RO observations | §7.3 first observations count as foreign-suppression signals; N20 |
| L7 trailing figure vs `advanceChapter` | §6.2 `commit` step 7 (word pages only), §9.2; C3q |
| Over-complexity | Remap kept only inside swap writers plus the gate's in-memory mapping; pull units are canonical at the merge. One `nativeRecord` path. Checkpoint commit added. Figure rule replaced by the hint. All adopted. |

### Rejected or modified in round 3
- **Red team M3 "contract canonical units at the merge" is adopted, but the fingerprint is kept.** It still guards native records and swap races in flight, both of which can carry units that differ from the gate's index. It is never a reason to hold without bound.
- **The audit's A9b note "publish one consolidated design" is taken literally:** this document. The earlier drafts are not referenced.
- **The "Use here anyway" steal prompt** (an extension the audit noted on O1) was simplified. The single "Use here" press steals automatically after `TAKEOVER_STEAL_MS`, so the owner's wording stays exactly as decided.
