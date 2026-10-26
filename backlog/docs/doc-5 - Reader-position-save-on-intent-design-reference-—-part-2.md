---
id: doc-5
title: 'Reader position: save-on-intent design (reference) — part 2'
type: specification
created_date: '2026-10-26 03:15'
tags:
  - reader
  - position
  - TASK-206
---
> Status (2026-10-26): REFERENCE ONLY, not scheduled. Owner chose targeted fixes for the 6 confirmed position bugs (TASK-206 subtasks) instead of this full refactor. Reviewed over 3 rounds by independent agents.
> Part 2 of 4. Parts: doc-4 (§1-6: problem, decisions, architecture, register, writer, gate), part 2 (§7-13: intent, non-intent, page mode, owners, externals, lifecycle, durability), part 3 (§14-17: content changes, constants, guard removal, case matrix), part 4 (§18-23: harness, telemetry, alternatives, subtasks, risks, review response).

## 7. Intent

### 7.1 Scroll mode: intent windows

There is no web API that attributes a scroll to user input, so attribution happens in a **window**: opened by input, closed when scrolling goes quiet. The reducer is pure (`intent-window.ts`); the hook adapts DOM events to it.

**States:**
- `closed`;
- `armed` (input started, nothing scrolled yet);
- `live` (the input is scrolling);
- `closing` (closed, with a deferred commit pending for `TAIL_MS`).

**Pressed state:**
- `pressed = activeTouches > 0 || mouseButtons ≠ 0`.
- `activeTouches = TouchEvent.touches.length`, read on touchstart, touchend and touchcancel.
- `mouseButtons` comes from pointer events with `pointerType ∈ {mouse, pen}` only. Touch-type `pointerup`/`pointercancel` are ignored, because Chrome sends `pointercancel` when a pan starts.
- Stuck-press recovery:
  - document-level `pointerup` and `lostpointercapture` (mouse/pen);
  - `buttons === 0` on any later mouse or pen event;
  - `visibilitychange` hidden;
  - a touchstart whose `touches` count disagrees with ours (resync).

**Arming and going live:**

| Input | Arms | Goes live |
|---|---|---|
| touchstart in the container | yes | touchmove past `TOUCH_SLOP_PX`, or any scroll event while pressed or within `RELEASE_QUIET_MS` of release (Chrome Android swallows touchmove inside the slop and throttles it during a scroll) |
| pointerdown (mouse/pen) anywhere in the container | yes | a scroll event while pressed, or pointermove past slop (scrollbar, selection autoscroll, middle-click autoscroll) |
| wheel in the container | – | immediately |
| keydown of a scroll key (Space, PageUp/PageDown, arrows, Home/End) outside editable targets, or `handle.scrollBy` | – | immediately |
| touchmove, or pointermove with `buttons ≠ 0`, while closed | re-arm | as above |
| a press while live | stays live (a tap that stops a fling does not reset the window) | – |

**Close detector:** native `scrollend` on the scroller where `'onscrollend' in window` (frame-bound by nature). Otherwise our own debounce: `QUIET_FRAMES` consecutive frames with no scroll event **and** at least `OWN_DEBOUNCE_MS`. Never virtua's `onScrollEnd`.
- The window closes at the first close signal **with `pressed === false`**.
- If no scroll happens within `QUIET_FRAMES` frames and `RELEASE_QUIET_MS` of release, it closes then.
- **Armed** windows also close on that same quiet rule with nothing pressed.
- `TAIL_MS` also requires `QUIET_FRAMES` frames, so at 1 fps the tail still sees the next frame's scroll before committing.

**Timeouts:**
- A live window with nothing pressed and no scroll for `MAX_IDLE_LIVE_MS` closes and commits.
- **Checkpoint** [L3]: a live window with no scroll for `MAX_IDLE_LIVE_MS` **while still pressed** (a missed touchend, or a Chrome scrollbar drag with no mouseup), or live for longer than `CHECKPOINT_MS` in total, commits a checkpoint. It runs the content check, applies the commit, re-baselines, and keeps the window open.

**Own aims:** scroll events between `ownAimBegin` and `ownAimEnd` never change window state, pressed or not.

**Content baseline = the persistent view anchor** `{word, offsetPx}`, set by the last commit, aim end or seed. It is never re-measured when a window opens. At close, `d = offsetFromTop(anchor) − anchor.offsetPx`.

**Close procedure:**
1. Content check. If `|d| ≥ MOVE_PX`, or the anchor is unmounted:
   - `candidate = topVisibleWord` (with slack, §8.4);
   - end-of-book rule: at the end of the list, a candidate below `intent.word` whose span is still visible isn't used;
   - enter `closing` with `pendingCommit = candidate`.
   Otherwise update `anchor.offsetPx` and go `closed`.
2. In `closing`, a scroll event with **`contentDelta ≠ 0`** (the anchor or the sampled top moved; virtua compensation alone has 0) within `TAIL_MS`, and with no own aim in flight, reopens the window as live and discards the pending commit.
3. When `TAIL_MS` expires, `commit(candidate, "scroll", viewProducer)` runs and the anchor is set to the candidate at its current offset. Exactly one commit per gesture.
4. A flush, unmount or owner change **applies** a pending commit synchronously. A jump or adopt **cancels** it [A14].

**Hard rules:**
- **No window before `initialSettled`.** Keys, volume, wheel and touch during the landing are ignored (E2).
- **A programmatic jump or adopt** cancels any armed or live window and any pending commit. If still pressed, it **re-arms immediately** with the baseline at the jump's anchor. The jump's aiming phase is suspended as soon as that window goes live (the user wins).
- **Relayout during a live window** (layoutKey, width, sync-applied settings mid-fling): commit `lastCandidate`, the rAF-sampled top word under the edge kept during live windows. Then start a relayout aiming phase to it, and re-arm if still pressed.
- **Selection drag** suspends aiming phases; scrolls go through the window as usual.
- **Owner changes** call `closeIntentWindow()` first (it applies the pending commit).

**Live side effects:**
- aiming is suspended;
- the highlight clears (replacing `suppressScrollHighlightClearRef`);
- the progress bar hides;
- read-aloud detaches (§10.3);
- `lastCandidate` is sampled per rAF via `elementFromPoint` just under the top edge, at two x positions.

**Unmeasurable DOM** (container height 0, no span measurable: hidden route, `<Activity>` hide):
- with a live window, use `lastCandidate`;
- otherwise commit nothing (`intent` is kept).

### 7.2 Programmatic intent

| Intent | Gate | View |
|---|---|---|
| TOC, search, highlight, glossary, mention, next-chapter footer, standard scrub, `navigateToWord` | If the target differs from the current word: `hold(intent.word)` (`enterForJump`), then `commit(target, "jump")`. While held, this only moves the intent. | cancel the window; `aim(target, anchorFor(target))` (§8.3) |
| Word tap (scroll) | `commit(tapped, "tap")` | anchor `{tapped, current offset}`, no scroll |
| Read from here / Back / browse toggle | `release({commit:true})` / `back()` / `hold()` | aim on Back |
| RSVP tick, step, context tap, scroll-scrub | `note(word, "rsvp", {rsvp, mountToken})`; `persistDue` on the cadence, on pause and on jump | – |
| Read-aloud | §10.3 | follow = own aim |
| Page turn | `commit(firstWord ?? figureAnchor, "page-turn")` (§9) | – |
| BLE, sync, reconcile, swap | externals (§11), remap (§14) | aim on adopt |

### 7.3 Foreign scrolls (D5)

A close with no window counts as foreign when:
- it is a scroll end while the window is closed;
- no own aim is in flight;
- no relayout signal arrived within `AIM_SETTLE_MS`.

Relayout signals are layoutKey, container resize, img `load`, `fonts.loadingdone`, and the item ResizeObserver, **including first observations** of newly mounted items [L6].

- Anchor displaced by ≥ `FOREIGN_MOVE_VH` × viewport height, or unmounted: `commit(topVisibleWord, "foreign-scroll", viewProducer)`, plus telemetry.
- Smaller: the **view anchor follows** `{topVisibleWord, offset}` with no commit (E1), so a later relayout aims at the spot TalkBack moved to.
- The device check (206.8) records how TalkBack scroll actions arrive (touch events vs programmatic scrolls) before the threshold is final.

---

## 8. Non-intent handling

### 8.1 Aiming phases (no idle re-aim)

The view anchor is `{word, offsetPx, mode: "word" | "heading-item" | "figure"}`.

**A phase starts on:**
1. the initial land (offset 0);
2. a programmatic jump, Back or undo (offset 0, or the heading item top);
3. an external adopt;
4. relayout triggers:
   - a layoutKey change;
   - a container width change, or a height change ≥ one line;
   - `document.fonts` `loadingdone`;
   - figure or decoration prop changes (a layout effect on `figuresByParagraph`, `glossaryByParagraph`, `discussionByParagraph`, `goalDivider`);
   - an item ResizeObserver size change of an already-measured mounted item at or above the anchor;
   - an img `load` inside the container (capture phase).
   - First observations count only as foreign-suppression signals (§7.3), not as aim triggers. Virtua's own estimate-to-measured step is covered by phase 1 while landing.

For trigger 4 (layoutKey, width, fonts), `offsetPx := 0`. Otherwise the recorded offset is kept.

**During a phase,** each scroll end and each trigger checks `d`:
- `|d| ≤ TOP_EDGE_SLACK_PX` → on target;
- mounted → `scrollBy` (own aim);
- unmounted → `scrollToIndex` with an offset.

**Bounds:**
- `MAX_AIMS` per phase.
- A phase **ends only after the anchor has been on target, with an unchanged layout signature, for `SETTLE_FRAMES` consecutive frames and at least `AIM_SETTLE_MS`** (I12). It also ends when a live window starts (suspended), at `MAX_AIMS`, or at the wall cap `AIM_PHASE_CAP_MS` (logged).
- **Fine-scroll landing** (`scheduleFineScroll`): stability is sampled in **rAF**, not `setTimeout`. It is stable after `SETTLE_FRAMES` frames with an unchanged `scrollHeight` and target offset. Its cap is `FINE_SCROLL_CAP_MS`; today's 600 ms timeout would fire after one frame at 1 fps. `onReady` (the reveal) only fires after stability, and the initial aiming phase keeps holding after it.
- "On target" also counts the list being at its end with the anchor inside the viewport.
- **Outside phases nothing re-aims.**

### 8.2 Content check

`anchorDisplacement(container, anchor) → {mounted, d} | "unmeasurable"`. It is shared by:
- window close;
- foreign classification;
- aiming;
- the 206.2 hotfix inside today's `handleScrollEnd`: a settle counts as "moved" only if the last settled span is unmounted or displaced by ≥ `MOVE_PX`, whatever scrollTop did.

### 8.3 Ceiling anchors for headings and figures, and the TOC landing fix [H2]

`WordIndex.wordOf` floors (`packages/core/src/word-index.ts`). So `paragraphStartWords[i]` for a `# ` heading paragraph, whose first byte is the `#` marker and not a word, is **the previous paragraph's last word**. `reader-figures.ts` (`buildFigureMap`) documents this.

The same floor explains the task note: a TOC jump to "Chapter 22" lands with the heading 184-214 px low and the end of chapter 21 visible, and "Read from here" then saves 55121.
- `ScrollView.jumpTo`'s heading check compares `paragraphStartWords[idx] === wordIdx`. With the floored start, that is false.
- So the code takes the fine-scroll path. `findAlignmentSpan` finds no span for the target (headings render without word spans) and falls back to the best span with `w ∈ [paragraphStart, next)` and `w ≤ target`. Because the start is floored, that range admits the **previous chapter's last word**, whose line is then aligned to the top.
- The saved 55121 is that line's first word, sampled by a later settle.
- This is a hypothesis grounded in the code; row I6 verifies it on Morning Star in 206.9.

**Fix.** Introduce `firstRenderedWord[i] = entriesByParagraph[i][0]?.wordIndex`: the ceiling, the first word actually rendered in paragraph i.
- **Jump heading check:** `chapterHeadingByParagraph.has(idx) && target ≤ firstRenderedWord[idx]`, or the paragraph is a `# ` heading paragraph containing the target. In that case, align the heading item top (mode `heading-item`).
- **`findAlignmentSpan`:** restrict the fallback to spans **inside paragraph i's item element**, bounded by `[firstRenderedWord[i], firstRenderedWord[i+1])`.
- The **heading paragraph start** used by `isHeadedParagraphStart` (`use-view-anchor`) also uses `firstRenderedWord`.
- **Figure anchors** use `firstRenderedWord[i]` of the paragraph the figure heads (§9.2).
- Unit tests cover a heading paragraph, a figure before a heading, and an empty paragraph.

### 8.4 `topVisibleWord` sub-pixel slack (206.2)

- `ScrollView.topVisibleWord` skips a span only when `rect.top < cutoffTop − TOP_EDGE_SLACK_PX`.
- `isOnTopEdge` becomes `[−TOP_EDGE_SLACK_PX, 4)`.
- `scrollOntoTopEdge` still lands 1 px below.
- Fractional geometry comes from layout (for example a 27.3 px line height). It does not come from DPR: scrollTop reads back as an integer at every DPR, so the tests use fractional CSS.

### 8.5 Scroll ticks

`BookReader.handleSetProgressWord` becomes display-only. It feeds:
- the progress bar;
- the session tracker's live word, via `getLiveWord()`: the tick during a live window, otherwise `intent.word`;
- buddy-live.

It never touches the position. `isCoarserThanLast` stays only as a display filter.

---

## 9. Page mode

### 9.1 Turns, jumps, relayout

- **Commits come only from user turns:** `goNext`, `goPrev`, `crossToNeighbor`, and the unmeasured-neighbour `settleOnLand`. Each goes through `onPageTurn → commit(..., "page-turn")`. The lander never commits.
- **Same-chunk `jumpTo` and external seeks** call `goToPage(target, {shouldSettle:false})` and set `currentWordRef = target`; the commit comes from the parent. That removes the jump guard from page mode, fixes lost turns within 1.5 s of a jump, and fixes the BLE page-start echo. `jumpTo` and `followWord` clear `settleOnLandRef`.
- **Re-aim on any change of `currentChunkWidth` after mount,** not only on `layoutKey`: `pendingTargetRef ??= currentWordRef`. This covers late figures, image upgrades and repairs, `src→null`, font swaps, decorations and e-ink CSS.
- The unreachable `onPositionSettleRef.current(target)` branch in the lander is deleted.
- A page with no word and no figure (an empty chapter) commits nothing.

### 9.2 Figure-only pages: the device-local hint (D10)

**Today:**
- `PageView.settleAtPage` calls `readFirstVisibleWord`, which returns `null` on a page without word spans (`page-view/measurements.ts`), so nothing is committed;
- `findPageForWord` only finds `span[data-word]`;
- `<figure>` (`reader-figure.tsx`) carries no data attributes.

**Change:**
1. **Attributes.** `ReaderFigure` renders `data-figure-id={figure.id}`. `renderFigures` passes the anchor as `data-figure-anchor`:
   - paragraph figures: `firstRenderedWord[i]` of the paragraph the figure heads (ceiling, §8.3);
   - trailing figures: `wordCount − 1`, plus `data-figure-trailing`.
2. **Read.** `readFirstFigureOnPage(columns, pageWidth, pageIndex) → {figureId, anchor} | null` (in `measurements.ts`) returns the first figure whose first rect's centre lies on the page.
3. **Commit.** `settleAtPage` and `settleOnLand` use `readFirstVisibleWord(...)`. If that is null, they use `readFirstFigureOnPage(...)` and:
   - `commit(anchor, "page-turn", { figureId })`;
   - A trailing-figure commit does not trigger `advanceChapter` (§6.2, L7).
   - **The hint is set or cleared on every page-turn commit, whether or not the commit is dirty.** The anchor equals the first word of the following text page, so turns between a figure page F and its text page P never change `positionWord`: nothing is persisted and `ack.rev` stays the same. A hint tied to writes would go stale.
     - The gate emits a `figureHint` effect on every page-turn commit: `{figureId, rev}` for a figure page, `null` for a word page. `rev` is the commit's emitted stamp if it persisted, otherwise the current `ack.rev`.
     - The runner writes `localStorage["lesefluss:figure-hint:<bookId>"]` synchronously (or removes it), and sets or clears `currentFigureRef`.
     - Every other position change also emits `figureHint(null)`: a jump, tap, back, adopt, toast action, nativeRecord or RSVP note.
4. **Use.** Only the **seed** and **relayout** consult the hint, and only while `hint.rev === ack.rev`:
   - the page-mode lander lands on the page containing `figure[data-figure-id=hint.figureId]` instead of `findPageForWord(word)`;
   - during the session, the current figure page's id is also held in memory (`currentFigureRef`), so relayout and rotation re-land on that figure.
   - A later commit to a word page, or any other position change, clears the hint (above). A hint whose `rev` no longer equals `ack.rev` (another device's position was adopted) is ignored and removed.
5. `findPageForWord` stays span-based. Jumps, read-aloud follow and search are unaffected.
6. Other devices, and scroll mode, land on the anchor word, the text after the figure. This is accepted and has no schema or sync change.

Several figure-only pages before one paragraph, or several trailing-figure pages, each have their own `figureId`, so the hint lands exactly.

---

## 10. Owners

### 10.1 View

ScrollView and PageView call `registerView(token)` with a **fresh token per mount**. A stale timer from an unmounted view is therefore dropped.

The view's own **layout cleanup** commits its window (owner-tagged). This covers a view swap mid-gesture: a sync-pulled `paginationStyle`, the e-ink toggle, or the RSVP switch.

### 10.2 RSVP

- **Entry:** `closeIntentWindow()`, `setOwner({rsvp, mountToken})`, which releases browse with a commit and calls `persistDue`. Then `rsvpInitWord = intent.word`.
- **Running:** ticks, steps, context taps and scroll-scrub go through `note`. `persistDue` runs on the 2 s cadence, on pause (only if the word changed) and on jump.
- **Exit:** `setOwner(view)` calls `persistDue` first, which closes the "exit while playing" gap. Late reports from RsvpView carry a stale token and are dropped.
- **WordIndex identity:** in `use-rsvp-engine`, an identity-only change (same word count) keeps `wordIndexRef` and `displayedWordRef`, and `timerRef` is cleared on any reset. The fallback `buildWordIndex` (cache miss) emits no notes until the canonical index has loaded. A real content change goes through §14.
- **RSVP scroll-to-scrub** uses the same window rule: only wheel/touch-attributed scroll deltas count, so resize clamps never report.

### 10.3 Read-aloud: transition table [A3, H1, M6, D3, D12]

`owner = {tts, session}` **only while the voice is playing and the view follows it.** Every transition below first calls `nativeRecord(...)` with the `{word, rev}` carried by the native event (§10.4), then the steps listed.

| State → event | Steps | New state |
|---|---|---|
| Off → Listen (start / listen-from-here) | `closeIntentWindow()`. If browsing, `release({commit:true})`. Start the voice at `intent.word` (or 0 at the end of the book). `setOwner({tts, s})`. | **Following** |
| Following → spoken word | `note(word, tts)`; `persistDue` on the cadence | Following |
| Following → tap / jump | `voiceMoveTo(target)`, `note(target)`, `persistDue` (immediately) [A14] | Following |
| Following → detach (drag > slop, wheel, live window) | `persistDue`; `setOwner(view)`; `hold(spoken)` with `heldFollowsVoice = heldIsVoice = true` | **DetachedPlaying** |
| Following → pause / sleep timer / audio focus / unplug | `persistDue`; `setOwner(view)`; `intent = spoken` | **PausedFollowing** |
| Following → stop / finished | `persistDue`; `setOwner(view)` | **Off** (view on the spoken word) |
| DetachedPlaying → spoken word | `followHeld(word, voiceAt)` (persisted on the cadence) | DetachedPlaying |
| DetachedPlaying → view scroll | windows move only `intent` (browse); detectors off | DetachedPlaying |
| DetachedPlaying → Back to voice | `intent = held` (internal note) [A3b]; `release({commit:false})`; `setOwner({tts, s})`; aim at the spoken word | Following |
| DetachedPlaying → Read from here | `voiceMoveTo(intent.word)`; `release({commit:true})`; `setOwner({tts, s})` | Following |
| DetachedPlaying → pause / sleep / focus | `followHeld(last)`; `heldFollowsVoice = false` (`held` frozen at the spoken word, `heldIsVoice` stays) | **PausedDetached** (browse bar: Back / Read from here) |
| DetachedPlaying → stop / finished (**Q2**) | `followHeld(last)`; `heldFollowsVoice = false`; session ends | **Off + browse**: held = the spoken word (persisted), intent = the view word; Back aims at the spoken word, Read from here persists the view word |
| PausedDetached → resume | the voice continues at `held` (the spoken word); `heldFollowsVoice = true` | DetachedPlaying |
| PausedDetached → Read from here | `release({commit:true})` (persists the view word) | **PausedFollowing** (a later resume follows the O4 row) |
| PausedDetached → Back | `back()` (aim at held) | PausedFollowing |
| PausedDetached → stop | as Off + browse | Off + browse |
| PausedFollowing → view scroll / tap / jump | normal view commits (owner view) | PausedFollowing |
| PausedFollowing → resume, `intent.word === spoken` | `setOwner({tts, s})` | Following |
| PausedFollowing → resume, `intent.word ≠ spoken` (**D12/O4**, the reader moved without browse) | `voiceMoveTo(intent.word)`; `setOwner({tts, s})` | Following |
| PausedFollowing → a long-move scroll enters browse (detector `hold(anchor)`, `heldIsVoice = false`) | normal browse | **PausedBrowsing** (owner view, `held` = the pre-move anchor) |
| PausedBrowsing → resume | `setOwner({tts, s})`: step 2 runs `release({commit:true, source:"read-from-here"})` first, persisting the browsed word. Then `voiceMoveTo(intent.word)`. | Following |
| PausedFollowing → stop | nothing more to persist | Off |
| any → app resume with a **live** session | `nativeRecord` (applies as note, or `followHeld`) | unchanged |
| any → app resume with a **dead** session (stopped natively while JS was frozen) | `nativeRecord`. If the owner is still `{tts, s}`, `setOwner(view)` runs first [A3d]; the record then applies as a view commit, or as `followHeld` when held is the voice. | Off (or Off + browse if detached) |

Browse detectors stay off while `heldIsVoice`.

### 10.4 Native record (screen-off progress) [H1]

**Wire format:**
- Each `WireSegment` (`services/tts/index.ts`) adds `words: number[]` and `charStarts: number[]`, copied from `SpeechSegment` (`services/tts/segments.ts`).
- `TtsNative.start` adds `bookId`, `sessionId`, `fingerprint` and `revFloor`.
- `TtsPlayer.Segment` (`TtsPlayer.java`; today only `id`, `text`, `chapter`, `opensChapter`) gets the two arrays.
- `revFloor` = `stampFor(now)` at start. Each JS persist calls `TtsNative.setOptions({revFloor})`.

**Native side:**
- On `onRangeStart`, binary-search `charStarts` to get `word`.
- `rev = max(System.currentTimeMillis(), revFloor + 1)`, and `revFloor` is raised to `rev`.
- Every `NATIVE_TTS_RECORD_MS`, and on pause, stop, sleep and focus loss, it calls `PositionMirror.put({bookId, word, rev, source:"tts", fingerprint, sessionId})`.

**Events to JS:** native state events (`onPlayingChange`, stopped, finished, and the reply to `getState` on `appStateChange` active) carry `{word, rev, sessionId}`. JS applies them through `gate.nativeRecord` **before** any other handling of the event [H1].

**Mirror semantics:** `PositionMirror.put` **keeps the max rev per book**. A stale JS put can never overwrite a newer native record [H1].

**Cold start** (JS restarted): the app-start reconcile writes the record (§12.4).

---

## 11. External positions

### 11.1 Sources and routing

| Source | Path | Toast |
|---|---|---|
| Sync pull | `mergeServerBook` read-back → `writer.observe(row, "sync")` → `gate.external({src:"sync"})` | adopt and keep toasts |
| Reconcile | `writer.observe(row, "reconcile")` → `external({src:"db"})` | adopt and keep toasts |
| BLE multi and single (`contexts/book-sync-context.tsx`, `applyDevicePosition` and the single-book connect path) | Await `positionsReady` [M4]. Compare the device position with the gate's `positionWord` if the book is open, else `writer.known` (after `load`). Device ahead → `writer.persist(word, stampFor(receiveTime), {kind:"ble"})` (no BLE push back). The open gate learns of it **only** through the writer's `applied` event with origin `ble`, which becomes `external({src:"ble"})`. App ahead → push the app position, as today. | none: silent follow (exception E4) |
| Book-detail chapter jump (`book-detail.tsx`) | Await `positionsReady`; `writer.persist(word, stampFor(now), {kind:"book-detail"}, {stampFinished:false})` | n/a (reader closed) |
| Native record | `nativeRecord` (§10) | none |
| Writer conflict | `writerEvent(conflict)` → §11.3 | as sync |
| Content swap | `remapped` (§14) | none |

### 11.2 Rules for `external(e)`

Before the rules run, the gate mirrors `maxSeenRev` from the writer event.

| # | Rule |
|---|---|
| 1 | **Not newer.** If `e.rev ≤ max(ack.rev, emitted?.rev ?? 0)`, ignore. This catches own echoes and stale rows. |
| 2 | **Units.** If `e.fp ≠ fingerprint`, set `pendingExternal = e` until a remap or index reload makes them match; at flush it is scaled instead (§14.2). Pull and reconcile rows are already in local units (§4.3), so this applies to native-record and swap races only. |
| 3 | **Defer.** If a window is armed or live, a commit is pending, an aiming phase is running, or `owner ≠ view`, set `pendingExternal = e` (the latest by rev). It is re-evaluated on window close (inside `commit` step 5), aim end, owner return, `onVisible` and flush. |
| 4 | **Held first.** If `held !== null`: `held = e.word`, `ack = maxByRev(ack, e)`, `baseline = {e.rev, seq}`. No view move, no toast. With `heldIsVoice`, the next spoken word supersedes it. |
| 5 | **BLE** (`e.src === "ble"`). If `e.word > positionWord`, adopt silently: `intent = e.word`, `seq++`, `baseline = {e.rev, seq}`, `ack = e`, aim. No toast, and rule 6 is skipped. Otherwise ignore. |
| 6 | **Sync / db.** `localNewer = seq > baseline.seq && hiddenSinceSeq !== seq`. **(a)** `e.word === positionWord` → `ack = maxByRev(ack, e)`, `baseline = {e.rev, seq}`. **(b)** Not `localNewer` → **adopt**: `previous = toast?.kind === "adopt" ? toast.previous : intent.word` (D11); `intent = {e.word, e.rev, src}`; `seq++`, *then* `baseline = {e.rev, seq}`; `ack = e`; cancel the window; `aim(e.word)` smooth **only if `owner === view`** [A12]; `toast("adopt", previous)`, which replaces any showing toast. **(c)** `localNewer` and the words differ → **keep**: emit `persist(positionWord, stampFor(intent.at))` (greater than `e.rev`); `baseline = {e.rev, seq}`; `toast("go-there", word = e.word)` "Newer position from another device · Go there", replacing any showing toast. |

### 11.3 Writer conflict

`conflict{seq, row}` arrives in the same tick as the read-back. It runs once per `seq` [A10].
- The gate runs rules 1, 2, 4, 5 and 6, with rule 3's deferral **not** applied.
- While `owner ≠ view` (RSVP or read-aloud is producing), the outcome is always **keep** (re-persist with `stampFor` > `row.rev`) plus Go-there if the words differ. There is never an aim or a move under a non-view owner [A12].
- The loop is capped at `CONFLICT_LOOP_CAP`.

**Interim, before 206.7.** Between 206.5 and 206.7, a conflict with the gate open is resolved as plain LWW: `ack = row`, no aim, no toast.
- In 206.5, BookReader still re-stamps on flush as it does today. A local write is stamped above every seen rev, so the outcome is exactly today's behaviour.
- From 206.6a onwards (no re-stamp), the interim LWW keeps the newer row in the DB while the view stays where it is. The next local intent persists over it, which is again today's behaviour.
- Neither step adds a loss race that exists neither today nor after 206.7 [A13].

### 11.4 Non-position writes

`commitChapter` passes `{isDeviceLocal: true}` (D6). Test: `updated_at` stays unchanged.

---

## 12. Lifecycle

### 12.1 Seed (render time) [H4]

- The reader route loader awaits `positionsReady` (§12.4) and loads the book row and the WordIndex.
- BookReader then creates the gate synchronously with `useState(() => createGate(seed({loaderRow, writerKnown: writer.known(id), pendingEntry: readPendingSync(id)}, wordCount, fp)))`, re-created on an `id` change.
- The views take `initialWord = gate.intent.word`.
- This replaces `didSeedOffsetsRef` and the reset-before-seed ordering, and fixes both the child-before-parent seed problem and a stale cached TanStack match.
- **Fast Refresh (DEV):** if the layout-effect setup finds the gate disposed, it recreates it from `writer.known` and the current intent.

### 12.2 Unmount (React 19.2 deletion order: parent layout cleanup → children's imperative-handle cleanup → ref detach → `removeChild`)

1. **BookReader layout cleanup:**
   - `scrollViewRef.current?.closeIntentWindow()`: applies the pending commit, or samples, with the unmeasurable fallback;
   - `gate.flush()`;
   - `dismissToasts`.
   - Idempotent and re-armable: the layout-effect setup re-arms after an `<Activity>` or Suspense hide/show, which runs layout cleanups without unmounting.
2. **BookReader passive cleanup:**
   - `gate.dispose()`;
   - then `writer.drain(id).then(pushSync).then(invalidate bookKeys.all + goal plans)`.
3. **Children:** ScrollView's own layout cleanup commits its window. On a full unmount that is a no-op, because step 1 already closed it. Late RsvpView and read-aloud reports are dropped by token.

### 12.3 Background

`pagehide`, `visibilitychange` hidden and Capacitor `pause` arrive in an uncertain order on Android. Each runs the same idempotent sequence: `closeIntentWindow()`, then `gate.flush()`, then `gate.onHidden()`.

The RSVP engine's own `pagehide` flush is deleted. There is no native background hold (§13.1).

### 12.4 App-start reconcile [A1, A5, M4, L4]

**When it runs:** after `initDb()` has resolved, **outside** its failure path. It is best-effort and time-boxed by `RECONCILE_TIMEOUT_MS`. `positionsReady` resolves when reconcile finishes **or** times out; it never rejects.

**For each book** with entries (`PositionMirror.getAll()` plus every localStorage pending key), it takes the max-rev entry and calls `writePositionCas(id, entry.word, entry.rev, {stampFinished: entry.source ∉ {jump, undo, remap, book-detail}})`, with **no rev bump**. The outcomes:

| Outcome | Action |
|---|---|
| `applied` | `observe`, clear the entries with rev ≤ entry.rev |
| `conflict(row)` with `row.rev ≥ entry.rev` | the row stands (E3); clear the entry |
| `missing` | the book was hard-deleted; clear the entry |
| error or timeout | keep the entry for the next start |

**Ordering and gating:**
- It runs before the startup `fullSync`, which awaits `positionsReady`.
- BLE writers and book-detail await it as well.
- `resetAppData` clears the `PositionMirror` and the pending keys.
- On web, a `storage` event for a pending key written by another tab (§13.2) triggers a reconcile of that key.

---

## 13. Durability

### 13.1 Android: the native mirror is the mechanism (D8)

**`PositionMirror` plugin:**
- `put({bookId, word, rev, source, …})` runs `SharedPreferences.Editor.commit()` on the plugin thread, **keeping the max rev per book**. JS posts it inside `writer.persist`, before the DB write is enqueued.
- `getAll()`, `clearIfAtMost(bookId, rev)`.

Durability does not rely on a pause hold, a wake lock or write priority. They can't stop the freezer or a swipe-kill, and priority would add adapter risk.

**L16** (force-stop at 0.3, 1, 3 and 6 s after a commit; also `am kill` and memory pressure; repeated with a long write in the queue):
- Pass: the relaunch seeds the last intent.
- **Fallback if L16 fails:** a synchronous `@JavascriptInterface` `PositionMirrorSync.put(json)` registered in `MainActivity`, which completes before `persist` returns.

Web and iOS use the localStorage pending entry.

### 13.2 Web: a single DB-writer tab (D9) [L5]

- **Lock:** `navigator.locks.request("lesefluss-db", {mode:"exclusive"}, …)`. Web Locks exist on all supported engines, so there is no heartbeat fallback.
- **Fence:**
  - on acquire, the holder increments `localStorage["lesefluss-db-fence"]` and keeps the value;
  - jeep-sqlite `autoSave` is disabled, and the write unit calls `saveToStore` itself;
  - before each write and before each `saveToStore`, the holder checks the fence. On a mismatch it aborts, closes the DB and shows the takeover screen.
- **TOCTOU** [L5]:
  - pending entries are cleared only after `saveToStore` resolves **and** a re-check of the fence still matches;
  - a new holder waits `STEAL_SETTLE_MS` after acquiring before it opens the DB, and reconciles pending keys (including those that arrive later through `storage` events);
  - so a save from the old tab that races the steal cannot lose a position: its pending entry survives and is reconciled through CAS.
- **Takeover:**
  1. A tab without the lock shows "Lesefluss is open in another tab" with "Use here".
  2. "Use here" posts `takeover` on `BroadcastChannel("lesefluss")`. A live holder flushes, drains, saves, closes, releases the lock and shows the takeover screen.
  3. If the lock isn't granted within `TAKEOVER_STEAL_MS`, the steal happens **automatically**, with no second press: the same request is retried with `{steal:true}`, which bumps the fence (the frozen-holder path). The screen keeps the single "Use here" button; there is no extra prompt.
  4. The new tab opens the DB fresh from IndexedDB.
- **Lock loss:** the holder's next fence check fails, so it closes its DB.
- This gates app bootstrap (DB, sync, auth queries), so it is an L-sized step.

---
