---
id: TASK-172
title: >-
  Reader selection toolbar redesign: two-step labelled toolbar for creating and
  editing highlights
status: Done
assignee: []
created_date: '2026-09-27 12:29'
updated_date: '2026-09-27 13:48'
labels:
  - capacitor
  - reader
  - ux
dependencies: []
references:
  - >-
    backlog/tasks/task-171.9 -
    Buddy-read-discussion-spoiler-gated-comments-at-a-position-and-reactions-to-shared-highlights.md
  - 'https://capacitorjs.com/docs/apis/haptics'
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reader's selection toolbar is finicky, clunky and not intuitive. Tap targets are 24–28px. The toolbar covers the top of the start handle, is always centred horizontally, and can go off the bottom of the screen. On touch there is no long-press-then-drag. Picking a colour saves without saying so, and X means "close", not "undo". A note typed before choosing a colour is silently lost. Actions behave inconsistently: colour keeps the selection, the others end it. Creating uses the floating toolbar while editing uses a separate bottom modal (highlight-modal.tsx). Icons have no labels (bookmark means glossary). The selection tint looks like the blue highlight.

Decisions made with the user:
- One floating toolbar with two steps. Step "actions" for an unsaved selection: Highlight, Note, Look up, Glossary, and Comment in a buddy read. Step "styled" for a saved highlight: colour swatches, Note, Share in a buddy read, Delete. Highlight and Note save with the last-used colour.
- An existing highlight opens the same toolbar in the styled step, with the same gestures as today (long-press, or a second tap in scroll mode). The HighlightModal is removed.
- Handles resize existing highlights.
- Tapping outside dismisses; a saved highlight stays saved. No X button.
- Add @capacitor/haptics (v8) for a tick on long-press and per-word ticks while dragging.

Related: the dead-first-tap bug found during the TASK-171.9 device test was already fixed separately in paragraph.tsx (the click swallower is disarmed on the next pointerdown).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An unsaved selection shows labelled actions (Highlight, Note, Look up, Glossary, plus Comment in a buddy read); Look up is disabled, not hidden, for multi-word selections
- [x] #2 Highlight saves with the last-used colour (remembered across sessions) and switches the toolbar to colour swatches, Note, Delete (plus Share in a buddy read)
- [x] #3 A note typed before any colour was chosen is saved
- [x] #4 Long-press or second tap on an existing highlight opens the same toolbar in the styled step; the separate highlight modal no longer exists
- [x] #5 Dragging a handle on a saved highlight updates its range and text snippet, and the change syncs
- [x] #6 Every toolbar tap target is at least 44px; the toolbar stays fully on screen, follows the selection horizontally, and never covers a selection handle
- [x] #7 On touch, long-press then drag extends the selection without scrolling the page or turning the page in page mode
- [x] #8 Long-press gives a haptic tick on native; the web build never throws when vibration is unavailable
- [x] #9 The selection tint is visually distinct from every highlight colour
- [x] #10 Unit tests cover toolbar positioning (above, flip below, pinned, horizontal clamp)
- [x] #11 agents/capacitor.md reflects the new toolbar and the removed modal
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
See the approved plan (copied here so it outlives the session):
1. State (use-highlight-selection.ts): remove editingHighlight/editingHighlightText; the toolbar step is derived from selectionSavedId. openHighlightEditor loads the highlight into anchor/end/savedId/color/note. New handleSelectionHighlight and handleSelectionNote (save first). Handle-drag cleanup commits the range for saved highlights (startWord, endWord, text, updatedAt; widen the updateHighlight Pick). Last-used colour in localStorage `lesefluss:highlight-color`.
2. Positioning: pure computeToolbarPosition in toolbar-position.ts with a vitest file. Measure the toolbar instead of using a constant height.
3. Toolbar UI rewrite plus CSS: labelled 48px actions, 44px swatch hit areas, neutral .word-selecting tint.
4. Delete highlight-modal.tsx; Share moves into the styled step; the note drawer is reused for edit.
5. Long-press then drag in paragraph.tsx (a non-passive touchmove preventDefault only while armed); thread onWordLongPressDrag through scroll-view and page-view; page-view does not swipe after a long press. Add the same click-swallow disarm to index.tsx mouse drag.
6. @capacitor/haptics ^8.0.2 plus services/haptics.ts; swallow web `unavailable` rejections; no per-word ticks on web.
7. Update agents/capacitor.md.

Executed with these changes to the plan: the selection tint uses --foreground (not --primary) and skips highlighted words; SelectionOverlay takes isHidden while the note sheet is open; the toolbar/handle z-index is 40/39, below the z-50 overlays; the point-to-word lookup lives in a shared word-at-point.ts; a pointercancel on a handle drag commits like pointerup; page-view yields to a long-press drag via hasLongPressFiredFor(pointerId) from paragraph.tsx; action min-width is 44px so the styled step fits 360px.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation decisions:
- Selection tint: --foreground at 16% instead of --primary, because #c94b2a is close to the orange and pink highlights. It is skipped on highlighted words, so a saved highlight shows its colour while selected.
- Haptics: selectionChanged is a no-op until selectionStart has run (checked in the plugin source), so services/haptics.ts starts it lazily. Web rejections (navigator.vibrate missing) are swallowed. There are no per-word ticks on web, because the fallback there is a 70ms buzz.
- Android files short app vibrations under TOUCH usage, so they follow the system Touch feedback setting. Apps whose haptics come through audio (Duolingo: usage MEDIA) bypass that setting. We intentionally respect it.
- No manual `cap sync` step: build:apk and build:aab already run `cap sync android`.
- Resizing a highlight that was shared to a buddy read changes what others see after the next sync. This already happens for colour and note edits; the server re-applies spoiler gating to the live range.

Device test on the Pixel 8 Pro (2026-09-27, debug build against the local phone DB), all passing:
- Toolbar: labelled actions; the first tap works; last-used colour survives a restart; recolouring works.
- Note: a note typed first is saved; the toolbar and handles hide behind the note sheet and come back correctly positioned.
- Delete shows a toast.
- Existing highlight: long-press opens the styled step; a handle resize persists and syncs (sync_highlights row checked).
- Long-press drag: extends without scrolling in scroll mode, and without turning the page in page mode; a tap dismisses and a normal swipe still turns the page.
- Buddy read: Share opens ShareHighlightSheet with the current text and note; Comment opens CommentComposerSheet.
- Haptics are felt once Touch feedback is on.

Bugs fixed during the device test: the selection tint covered saved highlights; the toolbar and handles showed over the note sheet backdrop; the toolbar came back off-screen after the sheet closed (it had been measured at 0x0 while hidden); the toolbar and handles showed over the appearance popover.

Review (3 fresh reviewers plus an adversarial verifier): seven findings fixed (see the plan addendum). Refuted findings were dropped: stale share row (tap-time race), Delete without undo (carried over from the old modal), empty snippet (unreachable), late remeasure (race), default-colour literal (nitpick).

Found while testing, not caused by this task: the scroll reader rewinds or zeroes the saved position after small scrolls such as a keyboard resize. Tracked as TASK-174.

Follow-up after Done: the Playwright e2e suite still drove the removed UI (the Cancel selection button, the highlight modal's Delete and note textarea, the "Add to glossary" aria-label), so 9 highlight/glossary specs failed. The page object is updated to the new toolbar: applyHighlight taps Highlight and then a swatch; dismissSelection taps a word outside the selection; Delete and Note go through the toolbar; Glossary is the visible label. All 9 pass. Six other specs failed only in the full run and pass on re-run (flaky import/library setup timeouts, unrelated).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Redesigns the reader's selection toolbar. It was finicky (small targets, a dead first tap, covered handles, could go off-screen), clunky (a colour tap saved silently, a note typed first was lost, create and edit used different interfaces) and hard to understand (unlabelled icons, a selection tint that looked like a blue highlight).

What changed (apps/capacitor):
- One floating toolbar with labelled 44px+ targets and two steps. "Actions" (unsaved): Highlight, Note, Look up (disabled for phrases), Glossary, Comment (buddy read). "Styled" (saved): colour swatches, Note, Share (buddy read), Delete. Highlight and Note save with the last-used colour (localStorage `lesefluss:highlight-color`). No close button: tapping outside dismisses, and a saved highlight stays saved.
- Existing highlights open the same toolbar (long-press, or a second tap in scroll mode), and the handles resize them. The range, snippet and updatedAt are committed on release or cancel and synced. highlight-modal.tsx is removed; Share moved into the toolbar; the note drawer is reused for edits.
- Placement: a pure `computeToolbarPosition` (toolbar-position.ts, unit tested) puts the toolbar above the selection, else below the end handle, else pinned. It follows the selection horizontally, is clamped to the screen and safe areas, and never covers a handle.
- Touch: long-press then drag extends the selection. The page doesn't scroll (touchmove is blocked only while armed) and page mode doesn't swipe (hasLongPressFiredFor). The dead-first-tap bug is fixed: the click swallower is disarmed on the next pointerdown, for both the touch and the mouse path.
- Haptics via @capacitor/haptics 8.0.2: a tick on long press and per-word ticks while dragging (native only; web errors swallowed).
- Layering: the toolbar and handles sit below popovers and sheets and hide while the note sheet is open. The selection tint is neutral and skips highlighted words.
- Shared word-at-point.ts replaces three copies of the lookup. agents/capacitor.md is updated.

Tests: `pnpm check-types` (tsc + 671 vitest tests, including the new toolbar-position tests) and biome pass. Full device test on a Pixel 8 Pro in scroll and page modes, including buddy-read Comment/Share, haptics and sync of a resized highlight. A three-reviewer review plus an adversarial verification pass; all confirmed findings fixed.

Follow-up: TASK-174 (the scroll reader rewinds or zeroes the saved position after small scrolls such as a keyboard resize) was found during testing and predates this work.
<!-- SECTION:FINAL_SUMMARY:END -->
