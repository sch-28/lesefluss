---
title: 'Reader position: save-on-intent design (reference) — part 3'
type: specification
created_date: '2026-10-26 03:15'
tags:
  - reader
  - position
  - TASK-206
---
> Status (2026-10-26): REFERENCE ONLY, not scheduled. Owner chose targeted fixes for the 6 confirmed position bugs (TASK-206 subtasks) instead of this full refactor. Reviewed over 3 rounds by independent agents.
> Part 3 of 4. Parts: part 1 (§1-6: problem, decisions, architecture, register, writer, gate), part 2 (§7-13: intent, non-intent, page mode, owners, externals, lifecycle, durability), part 3 (§14-17: content changes, constants, guard removal, case matrix), part 4 (§18-23: harness, telemetry, alternatives, subtasks, risks, review response).


## 14. Content and index changes

### 14.1 Fingerprint (exact) [A7]

`fingerprint = \`${wordIndex.wordCount}:${utf8ByteLength(content)}\``, using the WordIndex and content the gate has loaded. There is no new column.

### 14.2 Rules

- **Pull and reconcile rows are always in local units** (§4.3), so they carry the gate's fingerprint.
- **The native record** carries its session's fingerprint. On a mismatch at apply time, `nativeRecord` scales: `scaleWord(word, recordWc, localWc)`.
- **A pending external with a mismatched fingerprint** waits until the next remap or index reload. At **flush** it is scaled instead, so nothing is held without bound [M3].
- **The seed clamp** is in §6.2.

### 14.3 Swap writers (serial chapter refresh, `attach-original.ts`, re-import) [M5]

1. `await writer.beginSwap(bookId)`. This sets the per-book **swap lock** and then drains. While the lock is held, every `persist` for the book is held in `queued`, **never started**, even when nothing is in flight. This covers persists the gate makes after the drain resolves but before the unit commits, which are still in old units.
2. Compute `map(oldWord) → newWord`:
   - **identical bytes** (a tokenizer change only): `newIndex.wordOf(oldIndex.byteOf(w))`;
   - **shifted bytes:** a text anchor. Take the six normalised words from `w` in the old text, search the new text within ±10 % of the proportional byte position, and use the closest match. With no match, fall back to the proportional position and log `position_remap_fallback`.
3. In **one `runUnit`** (explicit BEGIN/COMMIT, §4.1), write the new content with `writeLongText` and the remapped position with the `writePositionCas` statements (`rev = stampFor(now)`, `stampFinished:false`).
4. Synchronously after the commit, `writer.endSwap(bookId, map, fp)`:
   - maps `acked` and `queued` through `map`;
   - re-stamps `queued.rev = max(queued.rev, maxSeenRev + 1)`;
   - emits `remapped`, which reaches `gate.remap` for an open reader in the same tick;
   - releases the lock and only then starts `queued`.
   - If the unit fails, `endSwap(bookId, identity)` releases the lock without mapping.

No old-unit write can land after the swap. In-flight writes were drained, and writes requested during the swap are remapped before they start.

---

## 15. Constants

| Name | Value | Used by |
|---|---|---|
| `TOUCH_SLOP_PX` | 8 | window going live, read-aloud detach |
| `MOVE_PX` | 4 | content check |
| `TOP_EDGE_SLACK_PX` | 2 | `topVisibleWord`, `isOnTopEdge`, on target |
| `QUIET_FRAMES` | 2 frames | own debounce, release quiet, tail (each together with its ms minimum) |
| `SETTLE_FRAMES` | 3 frames | aiming-phase end, fine-scroll stability, post-open hold quiet (layout signature unchanged) |
| `RELEASE_QUIET_MS` | 200 (minimum) | close with no scroll after release; armed close |
| `OWN_DEBOUNCE_MS` | 150 (minimum) | close detector without native `scrollend` |
| `TAIL_MS` | 150 (minimum; re-check against the 206.1 mid-fling `scrollend` measurement) | deferred commit, tail reopen |
| `MAX_IDLE_LIVE_MS` | 3000 and ≥ 5 frames | close (nothing pressed) / checkpoint (pressed) |
| `CHECKPOINT_MS` | 10000 | checkpoint during a long live window |
| `AIM_SETTLE_MS` | 300 (minimum) | aiming-phase end, foreign suppression (with `SETTLE_FRAMES`) |
| `AIM_PHASE_CAP_MS` | 10000 (cap) | aiming phase gives up, logged |
| `FINE_SCROLL_CAP_MS` | 5000 (cap) | fine-scroll stability gives up, logged |
| `MAX_AIMS` | 5 | per aiming phase |
| `FOREIGN_MOVE_VH` | 0.5 | foreign backstop |
| `CONFLICT_LOOP_CAP` | 3 | writer |
| `POSITION_WRITE_TIMEOUT_MS` | 8000 (existing) | watchdog |
| `RECONCILE_TIMEOUT_MS` | 8000 | app-start reconcile |
| `PERSIST_CADENCE_MS` | 2000 (existing) | RSVP / read-aloud `persistDue`, `followHeld` |
| `NATIVE_TTS_RECORD_MS` | 5000 | native record cadence |
| `TAKEOVER_STEAL_MS` | 3000 | web steal |
| `STEAL_SETTLE_MS` | 1000 | web new holder waits before opening the DB |
| `TOAST_MS` | 10000 | adopt / go-there / auto-commit toasts |

---

## 16. Guard removal (206.17)

| Guard (symbol) | Fate | Replaced by / reason |
|---|---|---|
| `suppressNextScrollEndRef` | removed | Non-intent scroll ends never save. |
| `suppressScrollHighlightClearRef` | replaced | The highlight clears when a window goes live. |
| `jumpScrolledRef`, `clearIfJumpDidNotScroll` | removed | No suppress flags left to leak. |
| `hasLandedRef`, `hideUntilLanded` | kept | Visual skeleton. |
| `didInitialScrollRef` | kept | One-shot initial landing. |
| `initialSettledRef`, `isInitialScrollReady` | kept | Reveal, and the gate for windows (E2). |
| `INIT_SETTLE_COOLDOWN_MS` | removed | Straggler settles are non-intent; the 206.2 post-open hold supersedes it first. |
| `MIN_SETTLE_SCROLL_PX` offset `hasMoved` | replaced | The content check (§8.2): shipped in 206.2, then moved into window close. |
| End-of-book rule (TASK-174) | kept, moved | Window-close commit. |
| `isCoarserThanLast` | display only | Ticks don't touch the position. |
| `JUMP_SETTLE_GUARD_MS`, `lastJumpAtRef` (all modes, read-aloud detach) | removed | Jumps commit their target; detach is on live input. The e2e helper `waitPastJumpGuard` goes too. |
| `userMovedRef` | replaced | `dirty`. |
| `seededWordRef`, `position_flush_skipped` | removed | Unreachable; a DEV assertion takes their place. |
| Pending localStorage | kept | Durability: rev-based, conditional clear, plus the Android mirror. |
| `persistedWordRef` skip | replaced | I2 against `ack`. |
| `settledWordRef` restore | removed | No tick pollution left to undo. |
| `didSeedOffsetsRef`, reset-before-seed ordering | replaced | Render-time gate. |
| `readerModeRef` early set, RSVP report drop | replaced | Owner tokens. |
| Browse `isBrowsing` checks, `BrowseController` | replaced / absorbed | `held`; the detectors run in the gate (`browse-detector.ts` stays pure). |
| Read-aloud ownership rules | replaced | §10.3. |
| TASK-205.8 hold (`use-relayout-anchor`) | generalised | Aiming phases (`use-view-anchor`); `isPending` no longer gates saves. |
| Fine-scroll timers | replaced | Frame-counted stability (`SETTLE_FRAMES` in rAF, `FINE_SCROLL_CAP_MS`); the 50 ms `setTimeout` sampling caused the 1 fps drift. |
| RSVP / read-aloud 2 s throttle | kept | The `persistDue` cadence. |
| Read-aloud `MOVE_DEBOUNCE_MS` | kept | Voice only; the target is noted at once. |
| Write watchdog, failure toast | kept | In the writer. |
| BLE echo guard | kept | Protocol level. |
| Page `layoutKey` lander | kept, extended | Chunk-width trigger, figure hint. |
| Page `settleOnLandRef` | kept | Cleared by jumps. |
| `metadata_updated_at` split, `<BookReader key={id}>` | kept | Orthogonal. |
| RSVP engine `pagehide` flush | removed | The reader flush covers it. |
| virtua `onScrollEnd` as the save trigger | removed | Our own close detector. |

---

## 17. Case matrix

**Test types:**
- U: a pure gate, writer, window-reducer or SQL unit test;
- H: a hook test;
- E: dev e2e (Desktop Chrome);
- Ex: E with forced non-intent injectors;
- E-1fps: E in the 1 fps BeginFrameControl lane (§18.1);
- ET: E with the touch project;
- EA: the e2e-app lane;
- D: the device lane, scripted, or manual where marked.

**Red?** (as of 206.3):
- seen: reproduced;
- exp: expected from the code;
- green: a regression guard;
- ?: learned in 206.1-206.3.

**Owner:** the subtask that turns the row green. **206.17 additionally requires every row green with no `knownBug` left** [A8].

Every E spec ends with an exact assertion on the save log (source and word).

### Lifecycle
| ID | Scenario | Expected | Test | Red | Owner |
|---|---|---|---|---|---|
| L1 | Open at 0 / span-less heading first | no persist | E | exp | 206.6b |
| L2 | Reopen at depth ×5 at **1 fps (BeginFrameControl lane)**, uniform fixture plus the novel fixture as a variant (in-app back and `page.goto`) | DB word and save count unchanged; top line = saved ±2 px | E-1fps, D, real Chrome | seen (1 fps, real Chrome) | 206.2 (save), 206.8 (windows) |
| L2n | The same at normal frame rate | unchanged | E | green | 206.2 |
| L2p | Same in page mode | unchanged | Ex | ? | 206.11 |
| L3 | Reopen near the end | unchanged; no chase | E | green | 206.9 |
| L5 | Forced remount during a route transition | no persist from the transient mount | E | ? | 206.10 |
| L5b | Re-entry with a cached TanStack match (stale loader row) | seed = max-by-rev; view on the latest | E | exp | 206.6b |
| L6 | Unmount within 100 ms of a wheel burst / mid-fling | top word at close, word-precise | E, ET | exp | 206.10 |
| L6b | Unmount under `<Activity mode="hidden">`, show, unmount | fallback used; re-armed | H, E | ? | 206.10 |
| L7 | Leave without moving ×3 | zero writes; `updatedAt` unchanged | E | exp | 206.6a |
| L8 | Leave during landing (< 500 ms) | zero writes | E | ? | 206.10 |
| L9 | pagehide / hidden / pause in any order, repeated | dirty → one write; clean → none | E | partial | 206.10 |
| L10 | Hidden ×5 without moving | zero writes | E | exp | 206.6a |
| L10b | Freeze → reopen (if feasible headless, per 206.1) | last intent | E | ? | 206.10 |
| L11 | Write abandoned → reopen | recovered once | U, E | green | 206.6b |
| L11b | A in flight, B queued, A applies, B abandoned | B recovered | U | exp | 206.6a |
| L11c | Abandoned write, then a lastRead-only write (commitChapter, BLE lastRead, sync lastRead backfill) | still recovered (by rev) | U, E | exp | 206.6b |
| L11d | Back within write latency after two commits, quick reopen | seeds the second; DB = second | U, E | exp | 206.6b |
| L11e | ABA: acked A, B in flight, commit A | A written after B | U | exp | 206.6a |
| L11f | Reader closed; queued write conflicts with a newer row | row stands; queued dropped (E3) | U | exp | 206.5 |
| L11g | No gate; `queued.rev > row.rev` after a conflict | queued written | U | exp | 206.5 |
| L12 | Serial chapter switch | correct on both sides | E | ? | 206.10 |
| L13 | Recovered pending + warm cache | view on the recovered word | E | exp | 206.6b |
| L14 | Same-session reopen right after back | seed = flushed word | E | ? | 206.6b |
| L15 | Fast Refresh while reading (DEV) | gate revived | manual dev | ? | 206.10 |
| L16 | Force-stop at 0.3/1/3/6 s after a commit; `am kill`; memory pressure; with a long write queued | relaunch seeds the last intent | D | ? | 206.14 |
| L16b | Wedged write past the watchdog, then a new commit | no second write starts; reconcile on restart | U, D | exp | 206.5 (U), 206.14 (D) |
| L17 | iOS Safari back-swipe mid-scroll (web build) | touchcancel releases; flush commits | manual | ? | 206.8 |
| L18 | Unmount with `pendingExternal` set | the flush evaluates it (rules 1, 2, 4-6) first | U, E | exp | 206.10 |
| L19 | App start with mirror/pending entries for unopened books | reconciled before the first push | U, E (web), D | exp | 206.10 (web), 206.14 (D) |
| L19b | Stale entry + newer DB row | the row stands; entry cleared; not resurrected next start | U, E | exp | 206.10 |
| L19c | Entry for a hard-deleted book | `missing`: cleared | U | exp | 206.10 |
| L19d | Reconcile wedged | `positionsReady` resolves after the timeout; entries kept; app usable | U, E | exp | 206.10 |
| L19e | BLE notify during startup reconcile | BLE waits for `positionsReady` | U | exp | 206.10 |
| L19f | `resetAppData` | mirror and pending cleared | U | exp | 206.14 |
| L20 | `writePositionCas`: applied / conflict / equal rev / missing / `finished_at` / `stampFinished` / `last_read` | as specified | U (SQLite), E (jeep), D | exp | 206.5 |
| L21 | Pull merge: stale snapshot vs a newer local row; wc mismatch scaled; metadata independent | as specified | U, E | exp | 206.5 |
| L22 | `runUnit` nested `enqueueWrite` | throws in DEV / reports; no deadlock | U | exp | 206.5 |

### Mode switches
| ID | Scenario | Expected | Test | Red | Owner |
|---|---|---|---|---|---|
| M1 | scroll → RSVP → scroll | RSVP starts at the intent; returns at RSVP's last word | E | green | 206.12 |
| M2 | Leave RSVP via a jump | target, browsed | E | green | 206.12 |
| M3 | RSVP toggle within 200 ms of open | intent = seed, never 0 | E | ? | 206.12 |
| M4 | Pagination toggle after a scroll | word-precise | E | exp | 206.6a |
| M5 | Back while RSVP is playing | freshest word persisted and pushed | E | exp | 206.12 |
| M6 | Late RsvpView report after exit | dropped | U, E | green | 206.12 |
| M7 | RSVP or Listen entered while browsing | browse released; persisted from the browsed spot | U, E | exp | 206.12 |
| M8 | View swap mid-fling (sync `paginationStyle`, e-ink toggle) | ScrollView cleanup commits its window | E | exp | 206.10 |
| M9 | Listen started mid-window; scroll after stop | pre-Listen window committed under view; post-stop scroll accepted | U, E | exp | 206.15 |
| M10 | Owner returns to view after RSVP / read-aloud; view commits accepted (mounted token) | accepted | U | exp | 206.12 |

### Intent inputs (must save; real input only)
| ID | Scenario | Expected | Test | Red | Owner |
|---|---|---|---|---|---|
| I1 | Wheel burst + smooth tail | one commit at rest | E | green | 206.8 |
| I2 | Touch fling (`dispatchTouchEvent`) | one commit after momentum | ET | ? | 206.8 |
| I2b | Drag, hold 500 ms, lift | commit at the quiet timer | ET | ? | 206.8 |
| I2c | Fling + 200 ms stall (CPU ×4) | exactly one commit at rest | ET | ? | 206.8 |
| I2d | touchcancel mid-fling | closes; one commit | ET | exp | 206.8 |
| I2e | Tap stops a fling | stopped spot committed | ET | exp | 206.8 |
| I2f | Fling, stop, fling | final rest committed | ET | ? | 206.8 |
| I2g | Flick with no touchmove | commit | ET, D | exp | 206.8 |
| I2h | Real 1-3 s fling (Pixel) | one commit at rest | D | ? | 206.8 |
| I2i | Finger rests > 3 s mid-drag, then drags | one window; commit at rest (with a checkpoint) | ET, U | exp | 206.8 |
| I2j | Touch-type `pointercancel` at pan start | ignored | U, ET | exp | 206.8 |
| I2k | Compositor flick during a stall | committed (baseline = anchor) | ET | ? | 206.8 |
| I2l | Native `scrollend` mid-fling after compensation (206.1 measurement) | one commit at rest | D, real Chrome | ? | 206.8 |
| I2m | Stuck press: missed touchend / scrollbar drag without mouseup | checkpoint commit within `MAX_IDLE_LIVE_MS` | U, E | exp | 206.8 |
| I3 | Scroll keys | commit per rest | E | ? | 206.8 |
| I3b | Non-scroll key during a compensation | no window, no commit | E | ? | 206.8 |
| I3c | Keys / volume / wheel / touch during the landing | ignored | E | exp | 206.8 |
| I3d | Page mode: volume / arrow keys | commit per turn | E | green | 206.11 |
| I4 | Scrollbar drag (classic, emulated overlay; desktop) | commit | E | ? | 206.8 |
| I4b | Dropped pointerup after a scrollbar drag | release via `buttons === 0`, or checkpoint | E | exp | 206.8 |
| I4c | Middle-click autoscroll started on text | commit | E / manual | exp | 206.8 |
| I4d | Selection-drag autoscroll | no aim fight; commit at rest | E | ? | 206.8 |
| I5 | Word tap | tapped word | E | ? | 206.6a |
| I6 | TOC jump to a chapter heading (Morning Star "Chapter 22") | heading item at the top ±2 px after 3 s; commit = chapter's first rendered word; Read from here = same | E, real Chrome | seen | 206.9 (landing), 206.6c (read-from-here word) |
| I6b | Jump during momentum | jump target kept; window cancelled | E | exp | 206.8 |
| I6c | Jump cancels a window while pressed; drag continues | re-armed; the drag commits | ET, U | exp | 206.8 |
| I7 | Search jump | target | E | green | 206.6a |
| I8 | Highlight / glossary jump | target | E | ? | 206.6a |
| I9 | Book-detail chapter jump | seed = chapter word; CAS; `stampFinished` false | E | green | 206.5 |
| I10 | Scrub (standard / RSVP) | paragraph start / last word on release | E | ? | 206.6a (standard), 206.12 (RSVP) |
| I11 | Next-chapter footer; auto-advance exactly once | as specified | E | ? | 206.6c |
| I12 | Browse enter / back / read-from-here, scroll + page | held word-precise | E | green / ? | 206.6c (scroll), 206.11 (page) |
| I12b | Long-move detector during a scroll | held = the pre-move word | U, E | exp | 206.6c |
| I12c | Auto-commit, then Undo | DB = anchor; view on the anchor | U, E | exp | 206.6c |
| I13 | Rapid input (10 bursts in 2 s + taps) | DB = last intent; ordered | E, U | partial | 206.8 |
| I14 | Read-aloud follow / detach / listen-from-here (fake read-aloud) | per §10.3 | E | ? | 206.15 |
| I14b | Stop while detached (Q2) | Off + browse; DB = spoken word | U, E | exp | 206.15 |
| I14c | Tap / jump while listening, leave within 250 ms | target persisted | E | exp | 206.15 |
| I14d | Read-aloud 10 min screen off → force-stop → reopen | ≤ 5 s of speech lost | D | exp | 206.15 |
| I14e | Pause while detached; resume | held frozen and persisted; resume continues at held | U, E | exp | 206.15 |
| I14f | Back to voice | intent = spoken word before release; no browse-word save | U | exp | 206.15 |
| I14g | Native record while detached | `followHeld` + persist | U | exp | 206.15 |
| I14h | Native stopped event delivered before the resume handler (H1 order) | the native record wins; no stale persist | U, E | exp | 206.15 |
| I15 | RSVP play / pause / step; repeated pause | persisted; repeated pause writes nothing | E | exp | 206.12 |
| I16 | BLE notify, scroll + page | silent adopt, no toast; page mode doesn't echo the page start | E, D | exp | 206.7 (scroll), 206.11 (page) |
| I16b | BLE ahead of the DB but behind a queued local word | compares the gate/writer word | U, E | exp | 206.7 |
| I16c | BLE ahead of a dirty local backward move (E4) | device wins silently | U | exp | 206.7 |
| I16d | BLE-sourced write | no BLE push; no sync/db external derived | U | exp | 206.7 |
| I17 | User scroll within 1.5 s of a jump, scroll + page | saved | E | exp | 206.8 (scroll), 206.11 (page) |
| I18 | Foreign scroll ≥ 0.5 vh | `foreign-scroll` commit + telemetry | E | exp | 206.8 |
| I18b | Foreign scroll < 0.5 vh, then relayout | no save; the anchor follows; relayout aims at the foreign spot | Ex | exp | 206.8 |
| I18c | TalkBack scroll actions | per the device findings | D manual | ? | 206.8 |
| I19 | Paused read-aloud (sleep / focus), then the reader scrolls | saved under view | E | exp | 206.15 |
| I20 | Detach while playing | browse held at the voice, following | U, E | exp | 206.15 |
| I21 | Every row of §10.3 | U row per transition | U | exp | 206.15 |
| I22 | Native record during a live session | noted + persisted | U, E | exp | 206.15 |
| I23 | Resume with a dead session, owner still read-aloud | `setOwner(view)` first; record applied | U, D | exp | 206.15 |
| I24 | RSVP exit while playing | last RSVP word persisted | U, E | exp | 206.12 |
| I25 | Resume after a deliberate move while paused (not browsing) | the voice restarts at the reader's word (D12) | U, E | exp | 206.15 |

### Non-intent (must never save)
| ID | Scenario | Expected | Test | Red | Owner |
|---|---|---|---|---|---|
| N1 | Font / spacing / margin / family locally, scroll + page | zero writes; anchor kept | E | green | 206.9 (scroll), 206.11 (page) |
| N1b | Settings change during a live window | `lastCandidate` committed once; re-aimed; re-armed | E, U | ? | 206.9 |
| N2 | The same via sync | zero writes | E | green / ? | 206.9, 206.11 |
| N3 | Orientation / width | zero writes | E | green | 206.9 |
| N4 | Height shrink 1 px / 300 px, including near the end | zero writes | E | partial | 206.9 |
| N5 | Font-face swap; OS font scale (emulated / D) | zero writes; re-aimed | Ex, D | exp | 206.9 |
| N6 | Late image above / in the cut item / upgrade / `src→null`, scroll + page | zero writes; anchor held | Ex | exp | 206.9, 206.11 |
| N7 | virtua first measurement (nudge ±1, resize above, resize the cut item), at normal rate and at 1 fps | zero writes; anchor ±2 px | Ex, E-1fps | exp | 206.2 (save), 206.9 (view) |
| N8 | Fractional CSS geometry + one DPR 2.625 smoke; reopen ×5 | zero writes | Ex | exp | 206.2 |
| N9 | Selection toolbar / dictionary / note sheet | zero writes | E | partial | 206.8 |
| N10 | Newer sync pull while idle | adopt + smooth jump + toast; later flush clean | E, EA | exp | 206.7 |
| N10b | Pull while local is newer | kept, re-persisted above; Go-there toast | U, E | ? | 206.7 |
| N10c | Auto-open racing the startup sync | as N10 / N10b | E | exp | 206.7 |
| N10d | Pull while browsing | held moves only; no toast | U, E | exp | 206.7 |
| N10e | Pull mid-gesture / during RSVP / read-aloud | deferred, then evaluated | U, E | exp | 206.7 (rules), 206.8 (gesture) |
| N10f | Own echo after any commit | zero adopts / aims / toasts | U, E | exp | 206.7 |
| N10g | Pull racing an in-flight write | register blocks the overwrite | U, E | exp | 206.5 |
| N10h | Remote clock +2 min | accepted locally and on the server; no rewind | U, EA | exp | 206.7 |
| N10i | Local clock backwards / near the epoch | revisions still increase | U | exp | 206.6a |
| N10j | Canonical: move, background, resume, pull | adopt + toast | U, E | exp | 206.7 |
| N10k | Two pulls while idle | both adopted | U | exp | 206.7 |
| N10l | Adopt Undo | DB = previous; view back | E | exp | 206.7 |
| N10m | Keep path, then Go there | re-persist; Go there jumps and persists | U, E | exp | 206.7 |
| N10n | Repeated conflicts under skew | loop ≤ cap; revisions increase | U | exp | 206.7 |
| N10o | Second adopt within 10 s | replaces the toast; Undo → the position before the first adopt (D11) | U, E | exp | 206.7 |
| N10p | Deferred external superseded by a local commit, different word | Go-there toast | U | exp | 206.7 |
| N10q | Conflict while owner is RSVP / read-aloud | keep; no aim | U | exp | 206.7 |
| N11 | Discussion marker inserted after a save | zero writes | Ex | exp | 206.9 |
| N12 | Glossary avatars / goal divider | zero writes | Ex | ? | 206.9 |
| N13 | WordIndex identity change mid-RSVP | no rewind, no write | E | exp | 206.12 |
| N13b | Content swap mid-RSVP / scroll / page | remapped; DB in new units | E | ? | 206.13 |
| N13c | Saved word ≥ wordCount | clamped; no write | U, E | ? | 206.6b |
| N13d | RSVP fallback index | no notes until the canonical index | U | ? | 206.12 |
| N13e | Writer remap; swap drains first; a gate commit arriving between the drain and the unit commit | held by the swap lock, remapped, then written in new units; no old-unit write after the swap | U | exp | 206.13 |
| N13f | Native record with a mismatched fingerprint | scaled | U | exp | 206.15 |
| N14 | RSVP scrub container resize | no report | E | ? | 206.12 |
| N15 | Compensation while browsing | no browse entry or auto-commit | E | ? | 206.8 |
| N16 | `commitChapter` | `updated_at` unchanged | U | exp | 206.7 |
| N17 | BLE single connect while open | silent adopt when ahead | E | exp | 206.7 |
| N18 | Momentum tail after close | tail reopen only on content delta; one commit | ET | ? | 206.8 |
| N19 | Web second tab | takeover screen; no DB | E | exp | 206.16 |
| N19b | Steal from a frozen holder | fence blocks the old tab; no snapshot overwrite; pending reconciled | E | exp | 206.16 |
| N19c | Old tab save racing a steal (TOCTOU) | pending survives; reconciled via CAS | E | exp | 206.16 |
| N20 | Relayout signal (including a first RO observation) suppresses foreign | no foreign commit within `AIM_SETTLE_MS` | U, Ex | exp | 206.8 |
| N22 | `position_rev_regression` never fires in the suite (tombstones/inserts excluded) | – | E | exp | 206.5 |

### Content edges
| ID | Scenario | Expected | Test | Red | Owner |
|---|---|---|---|---|---|
| C1 | End of book / trailing figure (scroll) | end-of-book rule; no chase | E | green | 206.9 |
| C2 | Span-less heading, scroll + page | ceiling anchor, heading-item mode | E, U | page ? | 206.9, 206.11 |
| C3 | Figure at the top (scroll) | stable | E | green | 206.9 |
| C3p | Page mode, turn onto a figure-only page, then reopen / rotate / font change on the same device | reopens **on that figure page**, via the hint (`hint.rev === ack.rev`); DB = ceiling anchor; another device lands on the text after the figure | E, U | exp | 206.11 |
| C3p2 | Page mode: on a figure page F, turn forward to the text page P (same anchor word, no write), then reopen | reopens on **P** (hint cleared by the word-page commit) | E, U | exp | 206.11 |
| C3p3 | Page mode: jump to P, turn back to the figure page F (same anchor word, no write), then reopen | reopens on **F** (hint set with the current `ack.rev`) | E, U | exp | 206.11 |
| C3q | Page mode: several figure-only pages before one paragraph; trailing-figure page (serial) | each reopens on its own figure page; a trailing commit triggers no `advanceChapter` | E, U | exp | 206.11 |
| C3r | Figure before a `# ` heading | anchor = the heading's first rendered word (ceiling), not the previous chapter's last word | U | exp | 206.11 |
| C4 | Hyphen / dash splits | correct span | E | ? | 206.8 |
| C5 | 3k-word paragraph reopen | stable | Ex | ? | 206.9 |
| C6 | Empty / short book; empty chapter page | no write, no throw | E | partial | 206.6a, 206.11 |
| C7 | Heterogeneous paragraphs at depth (novel fixture), at 1 fps | stable ×5 | E-1fps | ? | 206.2, 206.8 |

### Properties (fast-check)
| ID | Property | Owner |
|---|---|---|
| P1 | Random sequences over commit, note, nativeRecord, followHeld, persistDue, flush, external (rev </=/between/>, src sync/ble/db, fp ±), writer events (applied/observed/conflict/failed), setOwner, registerView, hold, release, back, toastAction, hide, dispose, window live. Fake register DB with CAS + LWW; writes acked, failed, abandoned or wedged; abandon = re-seed. After drain, DB = the reference model. | 206.4 |
| P2 | No persist when `positionWord === ack.word` and nothing failed | 206.4 |
| P3 | A stale producer leaves the state deep-equal | 206.4 |
| P4 | Abandon + re-seed → intent = the last emitted word | 206.4 |
| P5 | Writer revisions strictly increase; ≤ 1 in flight; queue ≤ 1; no write behind `possiblyInFlight` | 206.4 |
| P6 | flush when clean → nothing; flush;flush → ≤ 1; nothing after dispose except drain | 206.4 |
| P7 | held + owner view → DB = held after drain | 206.4 |
| P8 | Adopt iff rules 1-6 say so; deferred is always re-evaluated | 206.4 |
| P9 | Own echo never adopts (I7) | 206.4 |
| P10 | Conflict events handled exactly once per seq | 206.4 |
| P11 | `dirty` unaffected by other origins (I11) | 206.4 |
| P12 | Reconcile never bumps a rev and never resurrects a cleared entry | 206.4 |
| W1 | No input → zero commits, except foreign ≥ 0.5 vh | 206.4 |
| W2 | Pure compensation (ΔscrollTop ≠ 0, Δcontent = 0) never commits | 206.4 |
| W3 | Live input + displacement ≥ 4 px → exactly one commit after the final quiet (tail-merged) | 206.4 |
| W4 | touchcancel / dropped pointerup / early debounce + tail → exactly one commit at rest | 206.4 |
| W5 | A jump cancels without a commit; re-arms while pressed | 206.4 |
| W6 | No commit before `initialSettled` | 206.4 |
| W7 | Armed with nothing pressed closes after `RELEASE_QUIET_MS` | 206.4 |
| W8 | Own-aim scroll events never change state | 206.4 |
| W9 | Every window ends or checkpoints (I10) | 206.4 |
| W10 | Tail reopen only on `contentDelta ≠ 0` | 206.4 |

---

