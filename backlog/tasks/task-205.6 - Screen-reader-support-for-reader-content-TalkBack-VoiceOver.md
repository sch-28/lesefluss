---
id: TASK-205.6
title: >-
  App usable with TalkBack: labelled controls, paragraph-level book text, route
  to read-aloud
status: Done
assignee:
  - '@claude'
created_date: '2026-10-20 22:23'
updated_date: '2026-10-28 22:04'
labels:
  - reader
  - accessibility
milestone: m-13
dependencies: []
parent_task_id: TASK-205
priority: low
ordinal: 178000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blind users run TalkBack all the time. Read-aloud (TASK-85) already covers listening to a book. A TalkBack user still has to reach it, though: open the library, import or open a book and press play. Many controls today have no labels.

Scope: make the app navigable with TalkBack, and make book text read sensibly at paragraph level.

Out of scope: continuous TalkBack reading in page mode, i.e. the screen reader driving page turns. Read-aloud is the supported way to listen to a book.

Findings from the 2026-10-21 review:
- **Why TalkBack reads word by word.** Every word `<span>` has its own onClick (apps/capacitor/src/pages/reader/paragraph.tsx ~322), so Chromium exposes each span as a separate clickable node. Putting aria-label on `<p>` is unreliable (the paragraph role prohibits naming), and `role="text"` is non-standard. Preferred fix: one delegated click/pointerdown listener per container using `closest("[data-word]")`. It costs nothing with TalkBack off and removes the per-word closures. It does rewrite long-press handling (paragraph.tsx ~243-310, module-level state), so it carries regression risk.
- **Progress, high.** A TalkBack double-tap clicks the centre of the focused node, which lands on a word span. handleWordTap then sets userMovedRef and calls savePosition (reader/index.tsx ~1076-1081), or opens the dictionary if that word is already active.
- **Progress, medium.** In page mode, TalkBack focus on text in off-page columns can scroll the overflow-hidden container and desync it from the translateX. That moves the view and changes the saved word.
- **Safe.** Position lookups depend only on `span[data-word]` (scroll-view.tsx, word-at-point.ts), so the spans and data-word must stay. Do not add visually hidden duplicate text, which adds DOM weight and can disturb column pagination. Any figure work must keep draggable={false} (WebView 148 freeze).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every control on the path library -> open book -> start read-aloud has a meaningful label and is reachable by TalkBack swipe navigation
- [ ] #2 Reader toolbar, Appearance popover, read-aloud controls and main sheets have labels
- [ ] #3 When TalkBack focuses book text it reads a whole paragraph, not one word per swipe
- [ ] #4 RSVP view tells screen-reader users that read-aloud is available
- [ ] #5 Activating book text with TalkBack (double-tap) does not change or save the reading position
- [ ] #6 In page mode, TalkBack focus does not scroll the page container or change the saved word
- [ ] #7 Word spans keep data-word; tap-to-set-position, second-tap dictionary/highlight, long-press selection and highlights behave unchanged for sighted users
- [ ] #8 Reader render cost with TalkBack off is no worse than before, measured on a long chapter
- [ ] #9 pnpm build and Android build succeed; existing selection-dismiss, highlights-*, dictionary, position-*, position-settle-paragraph-start, page-mode-* and reader-images-touch e2e specs pass; new e2e covers word tap and long-press after the click-handling change
- [ ] #10 Manual TalkBack pass on Android documented in the task
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
PLAN ONLY (2026-10-28). Coding waits for the planner's go. No Android device: AC10 (manual TalkBack pass) is blocked, as in TASK-205.7.

1. Delegated word gestures (AC3, AC5, AC7)
- New module pages/reader/word-gestures.ts. It replaces every per-span onClick/onPointerDown in paragraph.tsx with ONE pointerdown and ONE click listener on document (bubble phase), routed by closest("[data-word]") inside a registered reader root (a root with data-reader-text).
- Why document and not the reader container: Chromium marks an element with click/mouse listeners as clickable in the a11y tree. A listener on the container would make the whole text one actionable node ("double-tap to activate") and could merge paragraphs. Document-level listeners leave every <p> a plain text node, and TalkBack reads paragraph by paragraph (AC3). No hidden duplicate text; spans and data-word stay as they are.
- API: useWordGestures(rootRef, { onWordTap, onWordLongPress, onWordLongPressDrag, onWordMouseDragStart }), called once by scroll-view and once by page-view. Latest handlers live in a ref, so they never re-subscribe. Paragraph loses its 4 handler props (fewer memo breaks); ChunkContent and scroll-view stop threading them.
- Long-press state moves out of the per-span closure into one module-level gesture record: { pointerId, pointerType, word, startX, startY, timer, fired }. It replaces _cancelActiveLongPress and _longPressPointerId. cancelAnyActiveLongPress() and hasLongPressFiredFor() keep their names and exports (page-view and paragraph importers just switch modules), and their behaviour is unchanged:
  - 8px move cancels;
  - a mouse drag hands off to onWordMouseDragStart;
  - touchmove is blocked once the press fires;
  - drag-extend uses wordIndexAt;
  - the trailing click is swallowed after the press fires, disarmed on the next pointerdown (Android WebView sends no trailing click).
- The discussion marker's stopPropagation still keeps its taps out (bubble phase).
- wordText for the dictionary comes from the span's text nodes, skipping .glossary-inline-avatar (its letter is inside the word span).

2. Telling a TalkBack double-tap from a tap (AC5)
- A word tap counts only when the click follows our own pointerdown: same pointerId, pointerType touch, pen or mouse, on the same word, within the long-press window, and not a drag. Any other click on a word (no preceding pointerdown) is ignored: no setActiveWord, no save, no dictionary.
- Why not isTrusted, detail==0 or pointerType alone: Chromium's accessibility click (AXObject::OnNativeClickAction -> DispatchSimulatedClick, kFromAccessibility) is trusted. It sends mousedown/mouseup/click but no pointerdown. The click's pointerType reads "" and detail is 0, and both vary by version. The missing pointerdown is the one signal it can't carry.
- Second layer: once focus is paragraph-level, the simulated click targets the focused <p> itself (no hit test), so closest("[data-word]") finds nothing.
- Device risk (for AC10): if a TalkBack version replays double-tap as a real touch at the node's centre, that is indistinguishable from a tap. The manual pass must confirm.
- e2e: locator.dispatchEvent("click") on a word (no pointerdown) causes no save, no active-word change and no dictionary. A real mouse and touch tap still saves (scroll mode), and a second tap still opens the dictionary or highlight editor.

3. Page mode: off-page text out of the way (AC6)
- The risk is AX scroll-to-make-visible (what TalkBack focus triggers) scrolling an overflow:hidden box, desyncing it from translateX. The fix makes that impossible structurally: .page-clip becomes overflow: clip, which is not a scroll container. The reader's other overflow-hidden ancestors that only clip (reader-view's overflow-hidden) get the same treatment. Each is audited: anything that must stay a scroll container gets a scroll guard that resets scrollLeft/scrollTop to 0 on scroll. Min WebView supports overflow: clip.
- Neighbour (non-current) chunks get aria-hidden="true", toggled with chunkIndex. This is an attribute only: no layout, and no hit-test change, unlike inert, which would break wordIndexAt during a cross-chunk long-press drag. Discussion markers inside a hidden chunk are briefly unreachable; that's acceptable.
- Off-page columns within the current chunk stay in the a11y tree. TalkBack can read on past the page, the view stays put, and nothing saves, because settles come only from turns. Hiding them per paragraph after each settle is possible (rect reads for ~50 paragraphs) but is an owner decision (see below).
- e2e: scrollIntoView() and focus on a span several pages ahead. Every ancestor's scrollLeft/scrollTop stays 0, the transform and first visible word are unchanged, and no save is requested. This should fail today and pass after the fix.

4. Render cost (AC8)
- Baseline is HEAD, exported read-only with git archive into the scratchpad (no git writes) and built. The candidate is the working tree. Both are production builds served by vite preview on separate ports.
- A Playwright script outside the suite (tag @perf, grepInverted by default like @lowfps) opens a long chapter: the Morning Star EPUB's longest chapter, plus bigBookFixture with 2000 paragraphs, in scroll and page mode. CPU throttle 4x via CDP.
- Metrics:
  - open-to-revealed time;
  - CDP Performance.getMetrics ScriptDuration, LayoutDuration and TaskDuration across open, 20 page turns and a scroll fling;
  - Memory.getDOMCounters (nodes, jsEventListeners, which should drop sharply).
- 7 runs each, medians and spread, written into the task as a table. Pass: no median worse than baseline beyond its run-to-run spread.

5. Label inventory (AC1, AC2, AC4)
- A static scan found icon buttons mostly labelled (rsvp-controls, toolbar). The real inventory comes from a new audit spec, e2e/a11y-labels.spec.ts. It uses CDP Accessibility.getFullAXTree, with no new dependency (axe-core is an owner option). It walks the path library -> open book -> Listen, plus reader toolbar, appearance popover, read-aloud controls, annotations sheet, import sheet, book detail and RSVP. It fails on interactive nodes (button, link, slider, checkbox, switch, radio, tab, combobox) with an empty name, and on generic clickable nodes (a handler but no role).
- Known items from reading the code:
  - the RSVP play button says "Play" while playing (needs Pause/Play);
  - the RSVP word display must not be a live region (it would announce every word);
  - library cover tiles, the progress label and the scrubber need checking.
- AC4: RSVP view gets an sr-only note ("Read-aloud is available: use the Listen button to hear the book"), rendered once and not live.
- Fixes are aria-label or visible-text changes only; no layout changes.

6. Tests and checks (AC9)
- New: word-gestures unit tests (pointerdown -> click is a tap; click without pointerdown is ignored; long-press timer; drag cancel; swallow and disarm). e2e for word tap and long-press after the change, the AX-click no-save case, the page-mode scroll-guard case, and a11y-labels.
- Existing to run: selection-dismiss, highlights-*, dictionary, position-*, position-settle-paragraph-start, page-mode-*, reader-images-touch. pnpm build and Android build.
- Order: (1) gestures and their tests, (2) page-mode clip, (3) perf baseline/candidate, (4) labels and audit, (5) RSVP note.

Decisions for the owner:
- a) Hide off-page paragraphs of the current page-mode chunk from TalkBack after each settle? Recommendation: no for now (out of scope: continuous reading).
- b) TalkBack users have no way to turn pages in page mode (tap zones are not controls). Add sr-only Previous/Next page buttons, or leave page mode to read-aloud as the task scope says? Recommendation: leave it, and announce "Use read-aloud to listen" in page mode as in RSVP.
- c) Book-internal links (word-link spans) are not exposed as links. Follow-up task?
- d) axe-core dev dependency for the audit vs the CDP-only audit (recommended: CDP-only).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions (2026-10-28, planner defaults; the owner may override later):
a) Off-page paragraphs of the current page-mode chunk stay in the a11y tree. They are not hidden after each settle.
b) Page turning stays with read-aloud. Page mode gets an sr-only note, as RSVP does: read-aloud is the way to listen.
c) Book-text hyperlinks for screen readers move to follow-up TASK-205.10 (low, no milestone).
d) The label audit is CDP-only (Accessibility.getFullAXTree); no axe-core dependency.
Perf baseline: HEAD exported read-only with git archive into the scratchpad.
Status: plan approved. Coding is held until TASK-205.7's review fixes land (same files: scroll-view.tsx, reader/index.tsx).

Implementation (2026-10-28, worker). E2E not run: the planner runs the suite.
- pages/reader/word-gestures.ts: one pointerdown and one click listener on document, routed by closest('span[data-word]') inside roots registered by useWordGestures (scroll-view: containerRef; page-view: containerRef). Paragraph spans carry no handlers; Paragraph, ChunkContent and both views lose the 4 per-word handler props.
- Root cause made precise: React gives every element with an onClick a no-op native onclick, so each word span was a clickable a11y node. Scroll-view's own native click listener on its wrapper (show progress bar on tap) would have made the whole text one clickable node for TalkBack, so it now listens on document, filtered to the wrapper.
- A click is a word tap only after this module's own pointerdown on the same span. The press is cleared on pointercancel, and on a task after pointerup, so a later click with no press (a TalkBack activation, element.click(), dispatchEvent) does nothing.
- Long-press state is one module-level gesture record. cancelAnyActiveLongPress and hasLongPressFiredFor keep their behaviour and moved to word-gestures (page-view and scroll-view imports updated). The trailing-click swallow/disarm is unchanged; pointermove is now filtered to the gesture's own pointer, and a new press cancels a pending one.
- wordText skips the glossary avatar's initial.
- Page mode: .page-clip and the reader view use overflow: clip (not a scroll container, so focus or scrollIntoView can't move them). Neighbour chunks are aria-hidden.
- sr-only note in RSVP and page mode when read-aloud is supported: the view's nature, plus 'To listen to the book, use the Listen button at the top.'
- Existing e2e that tapped words with dispatchEvent('click') (dictionary, active-word-underline, reader.openGlossaryEditor) now use real clicks (click({ force: true })), since a press-less click is ignored by design.
- New tests: word-gestures.test.ts (9 unit cases); e2e/word-gestures.spec.ts (a real tap saves; a press-less click changes nothing; long-press selects; a word span is not its own a11y node while its paragraph is; page mode scrollIntoView on text pages ahead scrolls nothing and saves nothing); e2e/a11y-labels.spec.ts with helpers/a11y-audit.ts (CDP getFullAXTree: no interactive role with an empty name across library, import sheet, reader, appearance popover, annotations sheet, read-aloud controls, RSVP, reader menu, book page; page-mode sr-only note).
- AC8: playwright.perf.config.ts + e2e/perf/render-cost.perf.ts + e2e/perf/compare.mjs. A production-preview baseline vs candidate at 4x CPU throttle on a 2000-paragraph book, scroll and page mode: open wall time, CDP script/layout/task ms for open and for reading (fling or 20 turns), DOM nodes and jsEventListeners, 7 runs, medians with min..max. Baseline: the pre-205.6 production dist, copied to the worker's scratchpad as perf-baseline/dist. This is a better baseline than HEAD, which lacks the uncommitted TASK-97/205.7 work. Not run (Playwright).
- Static label scan: the path's icon buttons already have labels; the RSVP Play label is right, since its controls show only while paused. Finding: library book/list/series cards are clickable divs without a role. A TalkBack double-tap opens them (they open on click), but they aren't announced as buttons. Making them real buttons conflicts with lint (useSemanticElements / useFocusableInteractive) and nests the device badge; left as a candidate follow-up, not changed.
- Checks: vitest 1499/1499; tsc app + e2e clean; biome clean on touched files (pre-existing hits only); pnpm build ok; android assembleDebug ok.
- Blocked: AC10 (manual TalkBack pass, no device). Device risk to confirm there: a TalkBack build that replays double-tap as a real touch would look like a tap.

Review round 1 fixes (2026-10-28):
- HIGH 1, touch taps dropped: a touch tap's click comes from a gesture event in a later task. The press now lives until the next pointerdown, a pointercancel, or the click it produced, and a click counts only within 1000 ms of the release (ev.timeStamp). Unit case: the click after timers ran. e2e (hasTouch, tap()): tap sets word-active + saves, second tap opens the dictionary; near-miss tap; page-mode middle tap shows the chrome, no save.
- HIGH 2: reader view gets min-h-0 (a clip box is no scroll container, so as a flex item it grew to RSVP's 300vh spacer). e2e: paused RSVP keeps reader-view within the screen, focal word and Play in view.
- 3 Near-miss: a touch or pen pointerdown not on a span resolves the word within 8 px (wordIndexAt probes) when the paragraph holds the hit; the click on that paragraph then taps it. Mouse is exact, as before.
- 4 Paragraph leaf: the goal divider's announcement goes to one reader-level live region (reader-announcer.tsx, announce()). The discussion marker stays visually inline but is aria-hidden and tabIndex -1. An sr-only sibling button after the <p> carries the action; it shows on keyboard focus while staying absolute (no reflow).
- 5 Audit: a11yProblems adds the DOMSnapshot isClickable check (clickable elements with a generic or no role fail; React's #root and aria-hidden subtrees are exempt) plus the named roles dialog, alertdialog, image, progressbar, meter, option, listbox, treeitem and tabpanel. Allow-list: library cards (TASK-205.11) and the paused .rsvp-display (it holds its own Play button). Progress bars named: library card/list reading progress, import, bulk apply, device storage.
- 6 Perf: waits for opacity 1 (reveal, not mount); viewport pinned; both builds in one test, alternating order each run after one discarded warm-up; seeded once per build; usage text fixed; WEB_BUILD dist guard. Reproducible baseline: scripts/perf-baseline.sh [ref] [paths...] copies the working tree, takes the render-path files from ref (default HEAD, the 205.6 file list), links deps, builds into apps/capacitor/.perf/baseline-dist (gitignored). Verified: the baseline lacks the 205.6 reader strings, the candidate has them. Until the TASK-97/205.7 work is committed, HEAD versions of those mixed files also lack it, so baseline vs candidate covers more than 205.6 then. pnpm e2e:perf runs it; node e2e/perf/compare.mjs compares.
- 7 Unit (19 cases): late click, swallow only once, swallow disarm on next press, another pointer's move ignored, a new press replaces a pending one, drag-extend after firing, two roots, near-miss.
- 8 A second finger no longer cancels a fired long press. 9 The swallow listeners are removed on the last unregister. cancelAnyActiveLongPress cancels only a touch countdown, never a mouse press. This was the page-mode-spread right-page highlight failure: page-view's horizontal-drag detection cancelled the mouse selection drag; before 205.6 the cancel never covered mouse presses.
- 10 read-aloud wpm aria-live. The RSVP display is role=button 'Pause' while playing; paused it holds its own Play button. The rsvp-controls and read-aloud-controls wrappers drop onClick (pointerdown stop only); the display ignores clicks from inside the controls.
- 11 scroll-view's document click (progress bar) needs a pointerdown inside the wrapper first.
- 12 Paragraph isOffscreen (from ChunkContent): the sr-only comments button is tabIndex -1 in aria-hidden neighbour chunks.
- 13 Cleanup: registerWordGestureRoot is a plain export (no __testing); LONG_PRESS_MS from long-press.ts; stale index.tsx comment fixed; isOwnA11yNode moved to a11y-audit.ts; page-mode focus test walks up from the ahead span within the current (non-hidden) chunk and checks scrollTop too; a11y page-mode test waits for open settle and enables fake TTS. The note renders only when read-aloud is supported, which was the reason for the failure.
- 14 Docs: agents/capacitor.md (touchmove block in word-gestures.ts, reader file tree, paragraph notes, pnpm e2e:perf + baseline script). package.json e2e:perf.
- 15 AC1 is partial: the library cards move to TASK-205.11 (selection-state AC added there).
- Also: the appearance popover's 4th theme (TASK-205.4 High contrast) shows the short label 'Contrast' (THEMES.short; accessible name stays 'High contrast'), with wrap-anywhere at large scales.
Checks: vitest 1525/1525, tsc clean, biome clean on my files (pre-existing hits only), pnpm build ok, baseline script ok. E2E not run.

Targeted-run fixes (2026-10-28):
- <body> isClickable: Chromium reports body click-responsive whenever the document has click listeners (the word-gestures and scroll-tap delegates); no app code listens on body, and Android's clickable flag does not reach a node from document-level listeners. The audit exempts body, with a comment.
- Unnamed <svg> image: sonner's built-in toast icons. The Toaster (packages/ui) now passes lucide icons, which are aria-hidden by default.
- position-font-scale reload-alone: a wheel in headless Chromium scrolls at once, and its scrollend settles (and saves) in that same frame, so the 'before == baseline' premise was wrong for a wheel. The flush variants now scroll with a CDP touch drag whose finger never lifts, and the page reloads itself in the first frame the list has moved 400 px. No scroll end can have come, so the pagehide flush is the only possible save and the assertion stands.
- Perf config: __dirname replaced by fileURLToPath(import.meta.url). Smoke run with PERF_RUNS=1 (see below).
- Popover theme row: grid, 4 across with text-xs/px-1 labels, 2x2 below a 16.5rem container (rem-based, so 200% switches); wrap-anywhere only as the last fallback.

Rerun: annotations sheet drawer gets aria-label 'Annotations' (it was an unnamed dialog; the popover's label is worker-2's change).

Planner verification: targeted e2e on the shared tree, then the remaining fixes verified by worker 1 in an isolated copy (a11y-labels, large-text-layout, position-font-scale 15/15). Perf (scripts/perf-baseline.sh baseline vs candidate dist, 7 alternating runs): page mode open -19% wall, -25% script, DOM nodes -59%, JS listeners -90%; scroll mode open -3% wall, listeners -48%. The read phase is within noise (+3% to +18% script, overlapping ranges, CPU contended by parallel sessions). Full-suite e2e is deferred to the end-of-loop run.

Device TalkBack pass (Pixel 8 Pro, 2026-10-28, planner via adb; partial). Accessibility tree from uiautomator with TalkBack on:
- Library: tab bar, header buttons and Add book are labelled. Book cards are unnamed clickable views (TASK-205.11). Progress is exposed as two nodes, '33' and '%'.
- Reader (page mode): Back, Listen, Switch to RSVP reader and Annotations are labelled. The page-mode hint pointing to Listen is present. Book text is exposed one node per paragraph (AC3 confirmed on device).
- BUG: 'More actions' (Radix DropdownMenu trigger, aria-haspopup=menu) has an empty content-desc on Android (NAF=true), even though the DOM has aria-label. It's the only aria-haspopup button, and the e2e DOM-snapshot audit can't see this. Follow-up: TASK-205.13.
- NOT DONE: real gestures. Injected adb double-taps don't register as TalkBack double-taps, and TalkBack's tutorial (TrainingActivity) keeps coming back over the app. AC5/AC6 on device (double-tap on text, swipe focus in page mode) still need a human pass, about 5 min. Covered in e2e by word-gestures.spec (click with no press, focus-ahead in page mode).
TalkBack was switched off again afterwards.
<!-- SECTION:NOTES:END -->
