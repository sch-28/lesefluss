---
id: doc-4
title: 'Reader position: save-on-intent design (reference)'
type: specification
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
tags:
  - reader
  - position
  - TASK-206
---
> Status (2026-10-26): REFERENCE ONLY, not scheduled. Owner chose targeted fixes for the 6 confirmed position bugs (TASK-206 subtasks) instead of this full refactor. Reviewed over 3 rounds by independent agents.
> Part 1 of 4. Parts: doc-4 (§1-6: problem, decisions, architecture, register, writer, gate), part 2 (§7-13: intent, non-intent, page mode, owners, externals, lifecycle, durability), part 3 (§14-17: content changes, constants, guard removal, case matrix), part 4 (§18-23: harness, telemetry, alternatives, subtasks, risks, review response).

# TASK-206 design: the saved word is the source of truth

Status: **final**, the consolidated backlog document for TASK-206 AC#1.

It went through three rounds of independent review:
- round 1: architect, feasibility, red team;
- round 2: audit, red team;
- round 3: audit ("ready after small edits"), red team (no critical findings).

The binding owner decisions are in §2. This document stands alone; earlier drafts (`design.md`, `design-v2.md`, `design-v3.md`) are history only.

Notation:
- Code is cited by file plus symbol, not line number.
- Paths are relative to `apps/capacitor/src/`.
- Review ids appear in brackets where a rule exists because of a finding. They are **round-3 ids only**: `A1`-`A15` are audit findings, `H1`-`H4`, `M1`-`M6` and `L1`-`L7` are red-team findings, and `D1`-`D14` are the decisions in §2. Earlier-round ids are not used. §23 maps every round-3 id.

Contents:
1. Problem, goals, non-goals, accepted exceptions
2. Decisions
3. Architecture
4. Storage: the monotonic register
5. Writer
6. Gate
7. Intent: scroll intent windows, programmatic intent, foreign scrolls
8. Non-intent: aiming phases, anchors, content check, ticks
9. Page mode
10. Owners: view, RSVP, read-aloud
11. External positions
12. Lifecycle: seed, flush, reconcile
13. Durability: Android mirror, web single tab
14. Content and index changes
15. Constants
16. Guard removal
17. Case matrix
18. Test harness
19. Telemetry
20. Alternatives considered
21. Subtasks (paste-ready)
22. Risks and rollback
23. Review response (round 3)

---

## 1. Problem, goals, non-goals

### 1.1 Problem

In scroll mode today the view is the truth and the saved position follows it. Every scroll end (`ScrollView.handleScrollEnd`) samples the top visible word and offers it to `BookReader.handleScrollPositionSettle`, with no idea who scrolled.

Sources that produce such scroll ends, all of which become candidate saves:
- virtua's scroll-jump compensation for never-measured items above the viewport (`ACTION_ITEM_RESIZE` / `_fixScrollJump`, applied without a React render);
- reflow and fractional rounding;
- image loads and decoration inserts;
- settings applied by sync;
- our own jumps.

A dozen guards each try to recognise one source after the fact:
- time windows: `JUMP_SETTLE_GUARD_MS`, `INIT_SETTLE_COOLDOWN_MS`;
- suppress flags;
- a 4 px scrollTop threshold;
- `userMovedRef`;
- the TASK-205.8 hold.

Each new source slips past them. The visible symptom is that every reopen in real desktop Chrome saves a word about one line off (45046 → 45076 → 45090).

**Root cause, measured in 206.1.**
- The "fixture problem" hypothesis is **refuted**. Novel and uniform fixtures are both green at normal frame rates, in every headless and headed variant and at CPU 4×.
- The drift reproduces only at a **low frame rate** (about 1 fps). Real Chrome's occluded automation window runs at that rate, and so plausibly do Boox e-ink devices and loaded phones.
- It is deterministic headless with CDP BeginFrameControl: uniform at 1 fps moves one line on every reopen (45046 → 45034 → 45020 → …).
- **Mechanism:**
  1. `scheduleFineScroll` decides "stable" from `scrollHeight` sampled on 50 ms `setTimeout` ticks. At 1 fps no layout lands between samples, so it aligns and calls `onReady` a frame early.
  2. The next frame applies pending virtua measurements: same `scrollTop`, content shifted a line, and after `INIT_SETTLE_COOLDOWN_MS` has expired.
  3. `handleScrollEnd` saves the drifted line.
- **General lesson:** every open guard is wall-clock, while scroll and ResizeObserver delivery are frame-bound. This design therefore makes every stability, quiet and settle decision **frame-counted**, with wall-clock values used only as minimums and caps (§15, I12).

The same "write unless filtered" pattern exists elsewhere:
- **Flushes** re-stamp an unchanged word with `now`, which beats newer positions from other devices under LWW.
- **RSVP** rewinds when the WordIndex instance changes.
- **Page mode:** the jump guard swallows page turns; BLE echoes are rounded to the start of the page.
- **Sync:** a pull and a local write race in the DB, and the pull snapshot is not atomic.
- **Read-aloud:** a paused session still owns the position.
- **Android:** a kill can lose both the localStorage mirror and the queued DB write.
- **Web:** a second tab's whole-DB snapshot erases the first tab's positions.

### 1.2 Goals

- **G1.** The persisted position changes only on user intent, or on an external position that is newer by revision. Layout, measurement, rounding, images, settings sync, orientation and remounts never change it.
- **G2.** Every user intent that moves the reader persists a word-precise position, durably: through an Android kill, screen-off read-aloud and web multi-tab use. The only exceptions are §1.4.
- **G3.** A single pure gate per reader mount, plus a single module-level writer per book acting as a monotonic register, decide and perform every position change in the app. This is enforced by types, module boundaries and tests.
- **G4.** Correctness never depends on re-aim. Re-aim is UX only.
- **G5.** Every case in §17 is an automated test, red first where a bug exists. Device rows run in the device lane.

### 1.3 Non-goals

- Replacing virtua.
- The BLE wire protocol and firmware.
- BLE revision semantics (TASK-207).
- Server LWW, which stays `updated_at >=`.
- Reading-session accounting.
- TASK-162/187.

### 1.4 Accepted exceptions (owner-approved, O6)

| # | Exception | Why acceptable | Row |
|---|---|---|---|
| E1 | A foreign scroll smaller than 0.5 vh with no attributable input (small TalkBack or find-in-page scrolls) is not saved. The view anchor follows it, so the view is never pulled back. | It can't be told apart from layout drift; the next real input commits. | I18b |
| E2 | Input during the initial landing (keys, volume, wheel, touch before `initialSettled`) is ignored. | Lasts a few hundred ms while the skeleton still covers the view. | I3c |
| E3 | With the reader closed, a queued local write that conflicts with a higher-rev row already in the DB loses (plain LWW). | Nothing open can judge causality; every other device behaves the same. | L11f |
| E4 | BLE furthest-wins: a device notify ahead of a deliberate local backward move that hasn't reached the device yet wins. | Bounded by BLE push latency. TASK-207 fixes it. | I16c |

**Durability note (not a loss).** A write wedged past the watchdog reaches the DB at the next app start through reconcile (§12.4). Until then the mirror and the pending entry keep it durable (L16b).

---

## 2. Decisions (binding)

| Id | Decision |
|---|---|
| D1 | Structural approach: the saved word is the source of truth. Only user intent may change it. Layout, virtua, rounding, images and sync never save; at most they re-aim the view. |
| D2 / Q1 | A sync-pulled newer position for the open book, while the reader is idle, is adopted with a smooth jump and an Undo toast. Not while browsing or mid-gesture. |
| D3 / Q2 | Read-aloud stopped while the view is detached: the saved word is the spoken word, and the view becomes browse (Back / Read from here). |
| D4 / Q3 | BLE revision semantics are out of scope (TASK-207). Furthest-wins stays, routed through the writer and gate (§11.4), as exception E4. |
| D5 / Q4 | The a11y/foreign backstop is in, with telemetry and a device check of how TalkBack scrolls arrive. |
| D6 / Q5 | Narrow change: `commitChapter` (`services/serial-scrapers/commit.ts`) writes `lastRead` device-local and no longer stamps the position revision. |
| D7 / Q6 | Hotfix first (206.2). Revised after 206.1: a **post-open hold** through the existing relayout hook (anchored to the seed until real input), **frame-aware stability**, the `topVisibleWord` sub-pixel slack and a content-based `hasMoved`. It is gated on a red 1 fps reopen spec and a 5-reopen real-Chrome check, and it survives into the final design. |
| D8 | In scope: Android kill durability, the native read-aloud screen-off record, and a single active DB-writer tab on the web. **Android durability (owner signed off):** the native mirror, written with `SharedPreferences.commit()` **before** the DB write, is the mechanism. It is proven by force-stop timing tests at 0.3, 1, 3 and 6 s (L16). The fallback is a fully synchronous native write (`@JavascriptInterface`). There is no background task on pause. |
| D9 / O1 | A second web tab shows "Lesefluss is open in another tab" with "Use here", and keeps no DB connection (whole-app scope). |
| D10 / O2+O7 | In page mode, a figure-only page reopens **on that figure page** on the saving device. This is done with a device-local hint `{bookId, rev, figureId}`, used only by seed and relayout, only while `hint.rev === ack.rev`. `findPageForWord` stays span-based. Other devices land on the text page after the figure. No schema change. |
| D11 / O3 | Toasts last 10 s. A newer adopt or Go-there toast replaces the one showing. Undo returns to the position before the first adopt. |
| D12 / O4 | When read-aloud resumes after the reader moved **without being in browse** (a deliberate scroll after the voice paused, with any detach resolved), the voice restarts at the reader's current word. While browsing (detached), `held`, the spoken word, wins (§10.3). |
| D13 / O5 | When local progress is kept over a newer, different sync position, an inverse toast says "Newer position from another device · Go there". There is no cold-start special rule. |
| D14 / O6 | E1-E4 are accepted. The wedged write is a durability note. |

---

## 3. Architecture

| Layer | Where | Lifetime | Pure? | Role |
|---|---|---|---|---|
| Register SQL | `services/db/queries/positions.ts` | – | – | `writePositionCas`, `mergeServerBook`, `readPosition`; one queued unit each |
| Writer | `services/position/writer.ts` | module-level, per book; survives unmount; also works with no reader open | core pure, shell I/O | persist, observe, drain, remap, mirrors, cache, BLE push, sync scheduling, event stream |
| Gate | `pages/reader/position/model.ts` + `use-position-gate.ts` | per BookReader mount | model pure | decides: intent, owner, browse hold, detectors, adopt rules |
| Intent window | `pages/reader/position/intent-window.ts` (pure reducer) + `use-intent-window.ts` | per view mount | reducer pure | attributes input, samples at close |
| View anchor | `pages/reader/use-view-anchor.ts` (replaces `use-relayout-anchor.ts`) | per view mount | no | aiming phases |

**Module boundaries** [G3]:
- `updateBook`'s data type omits `wordPosition` and `updatedAt`.
- Only `services/position/writer.ts`, `services/sync` (via `mergeServerBook`) and the swap writers (§14) import the register SQL.
- Under `src/pages/**`, only `use-position-gate.ts` imports the writer's `persist`.
- Enforced by Biome `noRestrictedImports` with an allowlist, plus a vitest tripwire that scans for raw `word_position` SQL.
- **Accepted bypass writers:**
  - inserts of new rows: import, `queries.addServerBookWithContent`;
  - tombstones that stamp `updatedAt`: `queries.softDeleteBook` and friends in `books.ts`.

  They are not position updates of a live row, and N22 excludes them from the regression assertion.

---

## 4. Storage: the monotonic register

### 4.1 `runUnit` [M5]

`createDrizzleAdapter` (`services/db/adapter.ts`) today returns `{rows: []}` for `run` and drops `changes`. Its `enqueueWrite` chain is a single global queue.

A new method, `adapter.runUnit(fn)`, enqueues one unit that receives a **raw handle** with these operations:
- `exec(sql, params)` → `conn.run(sql, params, false)` (`transaction=false`, as `services/db/migrations.ts` does);
- `query(sql, params)`;
- `writeLongText(table, column, id, text)`, a conn-level chunked writer equivalent to the one used for content today (`services/db/queries/series.ts`), using `exec`.

`runUnit` wraps `fn` in explicit `BEGIN` / `COMMIT`, and `ROLLBACK` on a throw.

**Re-entrancy assertion.** While a unit runs, a module flag `inUnit` is set. Any `enqueueWrite` call while `inUnit` (for example a `db.*` call from inside `fn`, which would otherwise deadlock the queue) throws in DEV and reports `db_nested_unit` in production. Tests cover both.

### 4.2 `writePositionCas(id, word, rev, { lastRead, stampFinished })` [M2]

One unit:

```sql
UPDATE books SET
  word_position = :word,
  updated_at    = :rev,
  last_read     = MAX(COALESCE(last_read, 0), :lastRead),
  finished_at   = CASE WHEN :stampFinished = 1 AND finished_at IS NULL AND word_count > 0
                        AND :word * 100 >= word_count * :FINISHED_PERCENT
                       THEN :rev ELSE finished_at END
WHERE id = :id AND updated_at < :rev;
SELECT word_position, updated_at, word_count FROM books WHERE id = :id;
```

- **Outcomes:**
  - `applied`: the read-back shows `updated_at = rev` and `word_position = word`;
  - `conflict(row)`: any other row;
  - `missing`: no row (hard-deleted book).
- **Why read-back rather than `changes`:**
  - same semantics on web (jeep-sqlite), Android and Node SQLite;
  - it hands back the conflicting row;
  - its position in the same unit means no write can interleave.
- **`stampFinished`** is false for the sources `jump`, `undo`, `remap`, `book-detail` and `reconcile` (when the entry's source was one of these). Today `book-detail.tsx` passes `finishedAt` so that a jump into the epilogue does not mark the book finished; this keeps that.
- `FINISHED_PERCENT` is the constant behind `isFinishedSql`.
- Unit, web and device tests: applied, conflict, equal rev rejected (strict `<`), missing, `finished_at` stamped once, the `stampFinished` flag, `last_read` monotonic.

### 4.3 `mergeServerBook(id, merge)`: the pull, one statement [M3]

One unit, one `UPDATE`. Position columns are guarded by `updated_at`; metadata columns are guarded by `metadata_updated_at`. SQLite evaluates every `SET` against the pre-update row.

```sql
UPDATE books SET
  word_position = CASE WHEN updated_at < :rev THEN :localWord ELSE word_position END,
  last_read     = CASE WHEN updated_at < :rev THEN MAX(COALESCE(last_read,0), :rev) ELSE last_read END,
  finished_at   = CASE WHEN updated_at < :rev AND finished_at IS NULL AND word_count > 0
                        AND :localWord * 100 >= word_count * :FINISHED_PERCENT
                       THEN :rev ELSE finished_at END,
  updated_at    = MAX(updated_at, :rev),
  title         = CASE WHEN metadata_updated_at < :mrev THEN :title ELSE title END,   -- one line per defined field
  …
  metadata_updated_at = MAX(metadata_updated_at, :mrev),
  added_at      = CASE WHEN :addedAt IS NOT NULL AND :addedAt < added_at THEN :addedAt ELSE added_at END
WHERE id = :id;
SELECT word_position, updated_at, word_count FROM books WHERE id = :id;
```

**Canonical local units** [M3, A7]:
- `:localWord = serverWc && serverWc !== localWc ? scaleWord(serverWord, serverWc, localWc) : serverWord`.
- `localWc` is the word count of the local WordIndex for this book. It is read from the cached index, or from the persisted index blob's length; `word_count` is used only if no index exists yet.
- The merge **no longer writes `word_count` from the server** when local content exists. `word_count` follows the local content. A new book without content still takes the server `wordCount` through its insert.
- So DB positions are always in local units, and no external ever has to wait on a unit mismatch from a pull.

**JS side:**
- `buildBookMergeUpdate` (`services/sync/index.ts`) stays as a pre-filter. It decides whether to issue the statement, and which metadata fields are defined (`undefined` means omitted). The SQL guards are authoritative.
- The read-back row goes to `writer.observe(id, row, "sync")`.
- `lastReadBackfill` stays a separate device-local write.

Tests:
- a stale snapshot against a newer local row → position kept, metadata applied;
- a newer server row → both applied;
- server `wc` ≠ local → scaled, and `word_count` unchanged;
- `finished_at`.

---

## 5. Writer

### 5.1 Entry

```ts
type Origin = { kind: "gate"; gateId: number } | { kind: "sync" | "ble" | "book-detail" | "reconcile" | "swap" | "db" };
interface WriterEntry {
  acked: { word: number; rev: number; origin: Origin };       // max-by-rev of every applied write and observed row
  maxSeenRev: number;                                          // max over acked, own stamps, every observed row
  inFlight: { word: number; rev: number; origin: Origin; stampFinished: boolean } | null;
  possiblyInFlight: boolean;                                   // watchdog fired, promise unsettled
  queued: { word: number; rev: number; origin: Origin; stampFinished: boolean } | null;
  failed: boolean;
  conflict: { seq: number; row: { word: number; rev: number } } | null;   // one-shot by seq [A10]
  fingerprint: string | null;
}
type WriterEvent =
  | { type: "applied"; word: number; rev: number; origin: Origin }
  | { type: "observed"; word: number; rev: number; origin: Origin }   // a row this writer did not write (pull, BLE, reconcile, …)
  | { type: "conflict"; seq: number; row: { word: number; rev: number }; forOrigin: Origin }
  | { type: "failed" | "recovered" }
  | { type: "remapped"; map: (w: number) => number; fingerprint: string };
```

### 5.2 `persist(bookId, word, rev, origin, { stampFinished })`

1. Assert `rev > maxSeenRev`; otherwise set `rev = maxSeenRev + 1` (defensive) and log. Then `maxSeenRev = rev`.
2. Synchronously, in this order:
   - (a) The pending mirror. Until 206.14 that is the localStorage pending entry `{word, rev, source}` on every platform. After 206.14, Android uses `PositionMirror.put` (§13.1) and web/iOS keep localStorage.
   - (b) Optimistic `setQueryData` for `bookKeys.detail(id)` and `bookKeys.all` (`{wordPosition, lastRead, updatedAt: rev}`).
3. **Dedupe:** if `word === (queued ?? inFlight)?.word` and `!failed`, drop. The writer never dedupes against `acked`, so a keep-local rewrite after an observe is always written.
4. If `inFlight` is set (including `possiblyInFlight`), `queued = {…}` (last one wins) and return. Otherwise start the write.

### 5.3 Completion

- **applied:**
  - `acked = maxByRev(acked, {word, rev, origin})` [L1];
  - clear the mirror and pending entry for this book if `entry.rev ≤ rev`;
  - BLE push unless `origin.kind === "ble"`;
  - schedule sync unless the origin's source is streaming (RSVP or read-aloud ticks, where the gate passes `scheduleSync:false`);
  - emit `applied`;
  - start `queued`.
  - **Web:** a write is "applied" only after the unit's `saveToStore` has resolved **and** the fence re-check after it still matches (§13.2). Only then are `applied` emitted and the pending entry cleared.
- **conflict(row):**
  - `observe(row, "db")`;
  - if `queued` exists and `queued.rev > row.rev`, start it (no-gate retry, L11g);
  - emit `conflict{seq++, row, forOrigin}`;
  - an open gate resolves it synchronously in the same tick (§11.3);
  - with no gate open, the row stands (E3) and a `queued` with `rev ≤ row.rev` is dropped as superseded (logged);
  - loops are capped at `CONFLICT_LOOP_CAP`, after which the writer logs `position_conflict_loop`, sets `failed` and leaves the row.
- **missing:** drop the entry, clear the mirror and pending, log.
- **error:** `failed = true`, `inFlight = null`, keep the mirror and pending, start `queued`. The next persist or flush retries with a fresh stamp.
- **watchdog** (`POSITION_WRITE_TIMEOUT_MS`):
  - `failed = true`, `possiblyInFlight = true`, show the existing toast;
  - **no second write starts.** `queued` waits until the original promise settles, then normal completion applies;
  - a write that never settles is carried by the mirror and pending to the next start.

### 5.4 Other operations

- **`observe(bookId, row, origin)`** is called by every reader of the row: the pull read-back, reconcile, BLE, CAS read-back, `load`.
  - `maxSeenRev = max(...)`; `acked = maxByRev(acked, row)`;
  - clear mirror and pending entries with `rev ≤ row.rev` [L4];
  - emit `observed` with its origin [M1].
  - A row with `rev < acked.rev` and a different word raises the telemetry assertion `position_rev_regression`. It should be impossible, since every writer is a register.
- **`known(bookId)`** is synchronous. It returns `queued ?? inFlight ?? acked`, or `null` if the entry isn't loaded.
- **`load(bookId)`** is async: it reads and observes the row.
- **`drain(bookId)`** resolves when `inFlight` and `queued` are empty, or when `possiblyInFlight` is set (it never waits on a wedged write).
- **`remap(bookId, map, fingerprint)`** is synchronous. It maps the words of `acked`, `inFlight` and `queued`, and emits `remapped` (§14).
- **`subscribe(bookId, cb)`** delivers the event stream.

**BookReader derives externals only from writer events.** It no longer watches the detail query for externals: every DB position change passes through the writer (register writers, pull merge, reconcile). The detail query is used for metadata only [M1].

---

## 6. Gate

### 6.1 State

```ts
interface Owner { kind: "view" | "rsvp" | "tts"; token: number }
interface GateState {
  gateId: number;
  owner: Owner;
  viewToken: number;                    // registered by the mounted ScrollView/PageView; setOwner(view) uses it [A4]
  seq: number;                          // increments only when positionWord changes
  intent: { word: number; at: number; source: Source };
  held: number | null;
  heldFollowsVoice: boolean;            // browse held at the voice while it plays (§10.3)
  heldIsVoice: boolean;                 // held came from the voice (detach); survives pause
  ack: { word: number; rev: number };   // gate-local: own applied writes + accepted/adopted rows
  emitted: { word: number; rev: number } | null;
  maxSeenRev: number;                   // mirrored from writer events
  baseline: { rev: number; seq: number };
  hiddenSinceSeq: number | null;
  pendingExternal: External | null;
  lastConflictSeq: number;
  fingerprint: string;                  // §14.1
  wordCount: number;                    // from the loaded WordIndex
  browse: BrowseDetectorState;          // pure detectors from browse-detector.ts
  advancedChapter: boolean;
  toast: { kind: "adopt" | "go-there" | "auto-commit"; previous?: number; word?: number } | null;   // word: go-there target
  disposed: boolean;
}
```

- `positionWord`: owner `view` → `held ?? intent.word`; otherwise `intent.word`.
- `dirty = positionWord !== ack.word || writerFailed`.
- `stampFor(t) = max(t, maxSeenRev + 1, (emitted?.rev ?? 0) + 1, baseline.rev + 1)`.

**Ack matching** [A11, L1]: on an `applied` event with `origin.gateId === gateId` and `word === emitted.word`, set `ack = maxByRev(ack, event)`. A writer dedupe against this gate's own queued entry with the same word still matches, because the event's word equals the emitted word. Events with other origins never touch `ack` directly; they become externals.

### 6.2 API (pure; effects: `persist`, `aim`, `toast`, `dismissToasts`, `voiceMoveTo`, `advanceChapter`, `sessionDiscard`, `log`)

**`seed(cands, wordCount, fingerprint)`** [H4]
- `cands` = `{loaderRow, writerKnown, pendingEntry}`, all read **synchronously at render**.
- The winner is the max by rev. The loader row may be a stale cached TanStack match (`defaultPreload: "intent"`); `writer.known` and the pending entry cover that case.
- `durable` = the max by rev of `{loaderRow, writerKnown}`. `ack = durable`.
- If `pendingEntry.rev > durable.rev`, the pending entry wins: `intent = pendingEntry.word` (source `recovered`). Then `intent ≠ ack.word`, so the gate is dirty and emits `persist` for the recovered word.
- Otherwise `intent = durable.word` (source `seed`).
- Clamp: `intent.word` is clamped to `[0, wordCount-1]`. When the intent comes from `durable`, `ack.word` is set to the same clamped value, so a clamp alone never makes the gate dirty.
- `baseline = {ack.rev, 0}`.
- If a figure hint matches (§9.2), the seed also carries it.

**`commit(word, source, producer)`** (discrete intent)
1. Drop if disposed, or if `producer.kind ≠ owner.kind`, or `producer.token ≠ owner.token`.
2. If `word ≠ intent.word`: `intent = {word, now, source}`.
3. Browse detectors (sources `scroll`, `foreign-scroll`, `page-turn`; owner `view`; not `heldIsVoice`): a long move calls `hold(prevIntentWord)`; a resume calls `autoCommit()`.
4. If `positionWord` changed: `seq++`.
5. If `pendingExternal` is set, re-evaluate it now (§11.2, without the deferral of rule 3). This is where a superseded deferred external gets its Go-there toast [L2].
6. Unless browsing, and if dirty: emit `persist(positionWord, stampFor(intent.at), source)`.
7. `advanceChapter` (once, latched) fires only when all of these hold:
   - not browsing;
   - the source is `scroll` or `page-turn` from a **word page** (not a figure page) [L7];
   - `word ≥ wordCount-1`.

**`note(word, source, producer)`**: the same drop and intent rules, nothing emitted.

**`persistDue(producer)`**: if dirty, `persist(positionWord, stampFor(intent.at), intent.source)`.

**`nativeRecord(word, rev, sessionId, fp)`** is the single entry point for every native read-aloud record [H1]. Read-aloud transitions call it **first**.
- Accepted iff `sessionId ≥ latestSessionId` (the latest session). It ignores `owner.kind`.
- If `fp ≠ fingerprint`, scale the word by the word-count ratio (§14.2).
- Then:
  - owner is `{tts, sessionId}` → `note` plus `persistDue`;
  - `heldFollowsVoice` or `heldIsVoice` → `followHeld(word, rev)`;
  - otherwise (the session ended, owner `view`) → an internal view commit `intent = word`, `seq++`, persist.
- The stamp is `max(rev, stampFor(now))`.

**`followHeld(word, voiceAt)`** [A3e]: `held = word`; if `held ≠ ack.word`, emit `persist(held, stampFor(voiceAt), "tts")`. It runs at the read-aloud cadence and does not bump `seq`.

**`hold(anchor)`**: `held = anchor`; if `anchor ≠ ack.word`, emit `persist(anchor, stampFor(now))`. Callers:
- `enterForJump`;
- the browse toggle (`browse.start`);
- the long-move detector;
- read-aloud detach (§10.3).

**`release({ commit, source })`**: `held = null`, `heldFollowsVoice = heldIsVoice = false`. With `commit`, emit `persist(intent.word, stampFor(now), source)`. `seq++` if `positionWord` changed.

**`back()`**: `a = held`, `held = null`, `heldIsVoice = heldFollowsVoice = false`, `intent = {a, now, "jump"}`, emit `aim(a)`. No persist unless dirty.

**`autoCommit()`**: `release({commit:true, source:"auto-commit"})`, then `toast("auto-commit", previous = anchor)`.

**`toastAction(kind)`** [A14] is gate-internal and uses the current view token, so it survives a view remount inside the same reader.
- `undo-auto-commit`: `intent = previous`, persist, `aim`, `sessionDiscard`.
- `undo-adopt`: `intent = toast.previous`, persist, `aim`.
- `go-there`: `intent = toast.word`, persist, `aim`.
- On BookReader unmount, `dismissToasts`. No action ever runs on a disposed gate.

**`setOwner(next)`**
1. `persistDue(current)`.
2. If `held` is set, `next ≠ view` and `!heldIsVoice`: `release({commit:true, source:"read-from-here"})`.
3. `owner = next.kind === "view" ? {view, viewToken} : next` [A4].
- Callers first close the view's intent window, which **applies** any deferred commit [A14].

**`registerView(token)`**: `viewToken = token`. If `owner.kind === "view"`, also `owner.token = token`. Called by ScrollView/PageView on mount.

**`external(e)`**: §11.2.

**`writerEvent(ev)`**:
- update `maxSeenRev`;
- `applied` with this gate's origin → ack matching;
- `applied` with any other origin (`ble`, `book-detail`, `swap`, `reconcile`, another gate), and every `observed` → `external(e)`, with `e.src` derived from the origin: `ble` → `"ble"`, `sync` → `"sync"`, anything else → `"db"`. This is the **only** path by which BLE reaches the gate; `book-sync-context` never calls `external` directly;
- `conflict` with `seq > lastConflictSeq` → §11.3, then `lastConflictSeq = seq`;
- `remapped` → `remap`.

**`remap(map, fp)`**: map `intent`, `held`, `pendingExternal`, `ack`, `emitted` and the detector state. No `seq` change, no persist.

**`onHidden()`**: `hiddenSinceSeq = seq`. **`onVisible()`**: re-evaluate `pendingExternal`.

**`flush()`** [A2]:
1. If `pendingExternal` is set, evaluate it with rules 1, 2, 4, 5 and 6 (§11.2); rule 3's deferral is lifted. A fingerprint mismatch at flush is **scaled**, not held (§14.2).
2. If dirty, emit `persist(positionWord, stampFor(intent.at))`.
- Idempotent.

**`dispose()`**: `disposed = true`, `dismissToasts`. The writer keeps draining.

### 6.3 Invariants (property-tested)

| Id | Invariant |
|---|---|
| I1 | `positionWord` changes only through commit, note, nativeRecord, followHeld, back, release, toastAction, seed/recovered, an adopted external, or remap (a change of units). |
| I2 | No persist when `positionWord === ack.word` and the writer has not failed. |
| I3 | Only word-precise values. Scroll ticks have no gate access (by types). |
| I4 | A producer whose kind or token doesn't match never changes state. |
| I5 | After drain, the DB equals the last gate's `positionWord`, unless an adopted or kept-elsewhere external with a higher rev exists. |
| I6 | Writer revisions per book strictly increase. Every stamp is greater than every rev seen. |
| I7 | A refetch or event for our own write never adopts, aims or toasts. |
| I8 | No writer lowers `updated_at` or overwrites a higher-rev row. |
| I9 | A conflict loop ends within `CONFLICT_LOOP_CAP`. |
| I10 | Every intent window ends after release within `RELEASE_QUIET_MS` + `MAX_IDLE_LIVE_MS`, or **checkpoints** at least every `CHECKPOINT_MS` while it stays live (§7.1) [A14, L3]. |
| I11 | `dirty` is never changed by an event from another origin. |
| I12 | **Frame-counted settling.** No stability, quiet, settle or close decision is taken on wall-clock alone. It needs `N` consecutive rendered frames (rAF), as listed in §15, with an unchanged **layout signature** (`scrollHeight`, `scrollTop`, and the anchor's offset). A wall-clock value is only a minimum ("at least X ms as well") or a cap ("give up after Y, and log"). Tests run at 1 fps (BeginFrameControl) as well as at normal rates. |

---
