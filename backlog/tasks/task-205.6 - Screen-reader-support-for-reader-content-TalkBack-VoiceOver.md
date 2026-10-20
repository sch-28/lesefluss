---
id: TASK-205.6
title: >-
  App usable with TalkBack: labelled controls, paragraph-level book text, route
  to read-aloud
status: To Do
assignee: []
created_date: '2026-10-20 22:23'
updated_date: '2026-10-20 22:33'
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
