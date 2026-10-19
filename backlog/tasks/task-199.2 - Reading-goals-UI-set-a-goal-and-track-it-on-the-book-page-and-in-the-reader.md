---
id: TASK-199.2
title: 'Reading goals UI: set a goal and track it on the book page and in the reader'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 19:23'
updated_date: '2026-10-19 20:05'
labels:
  - feature
  - stats
  - ui
dependencies:
  - TASK-199.1
references:
  - apps/capacitor/src/pages/library/book-stats-card.tsx
  - apps/capacitor/src/pages/library/stats/
modified_files:
  - apps/capacitor/src/pages/library/reading-goal/goal-model.ts
  - apps/capacitor/src/pages/library/reading-goal/goal-card.tsx
  - apps/capacitor/src/pages/library/reading-goal/goal-chart.tsx
  - apps/capacitor/src/pages/library/reading-goal/goal-setup-sheet.tsx
  - apps/capacitor/src/pages/library/reading-goal/__tests__/goal-fixtures.ts
  - apps/capacitor/src/pages/library/reading-goal/__tests__/goal-model.test.ts
  - apps/capacitor/src/pages/library/reading-goal/__tests__/goal-card.test.tsx
  - apps/capacitor/src/pages/library/book-detail.tsx
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/goal-chip.tsx
  - apps/capacitor/src/pages/reader/paragraph.tsx
  - apps/capacitor/src/pages/reader/scroll-view.tsx
  - apps/capacitor/src/pages/reader/page-view/index.tsx
  - apps/capacitor/src/pages/reader/page-view/chunk-content.tsx
  - apps/capacitor/src/pages/reader/appearance-popover.tsx
  - apps/capacitor/src/pages/reader/annotations-sheet.tsx
  - apps/capacitor/src/theme/monochrome.css
  - apps/capacitor/src/services/db/queries/reading-goals.ts
  - apps/capacitor/src/services/db/__tests__/reading-goals.test.ts
  - apps/capacitor/src/services/stats/reading-goal.ts
  - apps/capacitor/src/services/stats/__tests__/reading-goal.test.ts
  - apps/capacitor/e2e/reading-goal.spec.ts
  - apps/capacitor/e2e/page-objects/reader.ts
  - apps/capacitor/e2e/appearance-persist.spec.ts
  - apps/capacitor/e2e/active-word-underline.spec.ts
  - apps/capacitor/e2e/eink-mode.spec.ts
  - apps/capacitor/e2e/search-jump.spec.ts
  - apps/capacitor/e2e/page-mode-chunk-crossing.spec.ts
  - apps/capacitor/e2e/import-large-epub.spec.ts
  - apps/capacitor/e2e/reader-images-progress.spec.ts
  - apps/capacitor/e2e/browse-mode.spec.ts
parent_task_id: TASK-199
priority: medium
ordinal: 157000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The visible part of per-book reading goals (product rules in parent TASK-199; data and calculations from TASK-199.1).

FIRST STEP, before any app code: build an HTML artifact mockup (Claude Artifact) with several clearly different design approaches for (a) the goal setup sheet and (b) the goal display on the book page, plus how the reader shows today's target. The product owner picks one before implementation starts. Record the chosen variant and the artifact link in this task's notes.

Setup: from the book page, set, edit or remove a goal. The reader enters either a finish date or a daily amount (percent, or minutes converted to percent at their pace); the other value updates live while editing. The missed-day mode (raise daily target | push finish date) is chosen here and can be switched later.

Display: today's target (% with one decimal and ~minutes), progress toward it, ahead/behind vs plan (% and days), projected finish date, the two per-book counters (days target met, days read) and a chart of planned line vs actual position over time. Plain stats with short labels in the style of `book-stats-card.tsx`; no motivational or sentence-style copy. The reader shows today's target progress unobtrusively and marks it done when met.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An HTML mockup artifact with at least three distinct approaches was shared and the chosen variant is recorded in the task notes before implementation
- [x] #2 A goal can be set from the book page by finish date or by daily percent/minutes, with the other value shown live
- [x] #3 The missed-day mode can be chosen when setting a goal and changed afterwards
- [x] #4 The book page shows today's target, today's progress, ahead/behind, projected finish date, both per-book counters and the plan-vs-actual chart
- [x] #5 The reader shows progress toward today's target and indicates when it is met
- [x] #6 Goal UI is not offered for serial books
- [x] #7 All goal text is short stat labels; no sentence-style status copy
- [x] #8 Works in light, dark and e-ink modes (no motion in e-ink) and at phone width
- [x] #9 Component tests cover setup conversions and the main display states (on track, behind, ahead, target met, goal completed)
- [x] #10 Reader header holds back, title, goal chip, RSVP toggle, Bookmark and More; Search and Appearance live in the More menu and Browse mode is started from the annotations sheet, with existing keyboard shortcuts still working
- [x] #11 The goal chart also shows reading done before the goal started (end-of-day positions from this book's sessions) as a muted line up to the goal's start point, without plan or met/behind judgement; books without earlier sessions show no pre-goal line
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Delegated by lesefluss-planner; design picks final (card A, slider+lock v2 sheet, reader chip + in-text divider, toolbar decision).

1. Pure UI model (pages/library/reading-goal/goal-model.ts, tested)
   - Setup conversions: log slider <-> days (7..365), days -> daily % (remaining / days), minutes at pace (book wpm -> global -> 225), finish date; presets 1/3/6 months; custom date -> days; spec for createGoal / change for replanGoalById from (lock, days).
   - Edit seeding from an existing goal (days to target date / projected finish, lock = mode).
   - Display model from ReadingGoalPlan: tone (ahead / behind / on track / met / complete), formatted stat labels (one decimal %, ~min, d), live chip numbers from a live word position.
2. Data: getReadingGoalPlan falls back to the newest goal when it is completed, so the completed state is shown instead of the card vanishing (one-line loader change, tested).
3. Book page: GoalCard above "Your reading" (title "Goal · by <date>", Edit, today x / y%, today minutes, vs plan % + d coloured, today bar, 4 stats, nivo chart plan dashed + actual solid + today marker, missed-day footer). Entry card "Set goal" when none; hidden for serial chapters, finished books, unknown length.
4. GoalSetupSheet (vaul Drawer + drawerSnapPoints): two lockable value cards, log duration slider, preset chips + Custom date (native date input), missed-day summary, Start goal / Save; edit mode adds Remove goal.
5. Reader header: back, title, goal chip, RSVP toggle, Bookmark (annotations sheet), More (Search, Appearance, existing items). Appearance popover anchored to More via PopoverAnchor. Browse mode button moves into the annotations sheet. Keyboard shortcuts untouched.
   - GoalChip: mini ring + "x / y%", popover with today bar, to go (~min), vs plan, days met. Live progress from the reader's position (browse anchor while browsing).
   - Divider: "today y%" after the paragraph containing today's target word, absolutely positioned inside the paragraph's existing bottom margin so neither VList heights nor page-mode pagination change. Turns solid green with a short animation when passed (CSS; e-ink kills animation globally; prefers-reduced-motion respected). No divider in RSVP.
6. Tests: vitest for goal-model (conversions + display states: on track, behind, ahead, met, completed) and component render tests where cheap; Playwright e2e reading-goal.spec.ts (set goal on book page, card visible, open reader, chip visible, read past target, met state). Update e2e page object + specs that click moved buttons (appearance, search, browse).
7. Checks: pnpm check-types, capacitor vitest, e2e (port 3001 free check first).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Mockup canvas (2026-10-19): https://claude.ai/artifact/6wP1dV4bxaTZKs2Fu91HGm. Book page cards A (stat card + position chart) / B (ring + 14-day bars) / C (track + goal calendar); setup sheets 1 (segmented tabs) / 2 (slider + lock date-or-daily) / 3 (calendar showing % per day for each date); reader i (target band on progress bar) / ii (toolbar pill + popover, toast when met) / iii (dashed marker in text + distance chip). Chosen variant: pending.

Picks (2026-10-19): book page = A (stat card + plan-vs-actual position chart). Setup = slider + lock (v2 board: smaller value cards, presets 1/3/6 months + 'Custom date' chip opening a date input; locked value = missed-day mode). Reader = toolbar chip with mini ring, tap opens detail popover; no success toast: the in-text 'today X%' divider (variant iii) marks today's target and turns green with a short animation when passed (no motion in e-ink / reduced motion). Toolbar crowding: Appearance moves into the More menu; whether Contents/annotations or Search also moves is still open (v2 vs v2 alt boards). RSVP shows no divider, so there the chip ring turning green is the only cue.

Toolbar decision (2026-10-19): reader header becomes back, title, goal chip, RSVP toggle, Bookmark (annotations sheet), More. Search and Appearance move into the More menu. The Browse mode (compass) button moves into the annotations sheet opened by Bookmark. Exiting browse mode stays on the existing BrowseBar ('Back to N%' / 'Read from here'), which replaces the header button's pressed state as the visible indicator. All design picks are final; mockup decision step complete.

Implementation (2026-10-19): pages/library/reading-goal/{goal-model.ts, goal-card.tsx, goal-chart.tsx, goal-setup-sheet.tsx}; pages/reader/goal-chip.tsx; Paragraph gains a goalDivider prop plumbed through ScrollView / PageView / ChunkContent; reader header reworked; AppearancePopover is now controlled and anchored to the More button; AnnotationsSheet gains the Browse mode button. getReadingGoalPlan (199.1 loader) now falls back to the newest goal when it is completed, so the card shows 'Done' instead of vanishing.

Divider: absolutely positioned inside the paragraph's existing 1.1em bottom margin (position: relative on that one paragraph), so it adds no height: VList item heights and page-mode pagination are unchanged and ChunkContent does not re-measure. Edge: a target paragraph that ends exactly at a page bottom in page mode puts the divider below the page clip, so it is not visible there.

Appearance from the More menu: Radix DropdownMenu moves focus while closing (onItemLeave), which the Popover's DismissableLayer read as focus-outside and closed it immediately. PopoverContent ignores onFocusOutside; outside taps and Escape still dismiss.

Labels: counters are 'days met' / 'days read' rather than the mockup's 'target streak' / 'read streak', because they are totals, not consecutive runs.

Open for planner: in scroll and page mode the reading position is the top word of the viewport / first word of the page, so by the time the target is passed the divider has (almost always) left the screen; the green transition is mostly seen when scrolling back. The chip ring is the cue that is always visible.

Product owner (2026-10-19): show pre-goal reading history in the goal chart as context (option 1). No backdated goals: days before the goal are never judged. Data comes from existing reading_sessions; ESP32/rsvpnano reading and pre-session history are not represented.

Checks: turbo check-types 8/8 (capacitor vitest 127 files). New: goal-model.test.ts (10), goal-card.test.tsx (5, card + chip states), reading-goals DB test +2 (completed fallback). e2e: reading-goal.spec.ts (2) new; page object gains openAppearance / openSearch / startBrowse, and the specs that clicked the moved buttons use them. Full suite: 143 passed, 1 failed (reader-images-progress 'search jump ... scroll mode', 1.0m timeout); the same file passed 14/14 with --repeat-each 2 in isolation, so load-related flake. AC #2 note: per the chosen slider+lock design the daily amount is set through duration (slider / presets / date), not typed as a percent or minutes; percent and minutes update live on the card beside it.

Not visually checked: e-ink (global html.eink rules strip the animation and transitions; colours fall to greys) and sepia.

AC #11: planReadingGoal returns historySeries (end-of-day positions of sessions that ended before the goal started and before its start day, carried across unread days, ending at the goal's start position; trimmed to the plan's own span so a long history does not squash the chart). GoalChart now uses a shared day axis and draws it as a muted solid line with a 'before goal' legend; nothing judges it. 3 new plan tests; checked visually with Playwright's clock seeding sessions four days back.

Review round 1 fixes (2026-10-19): (1) Appearance stuck open: root cause is Radix Presence + e-ink: a close racing the e-ink switch waits for an exit animation e-ink then strips (animationcancel reports 'none', so Presence ignores it). PopoverContent is keyed on isEinkMode; the popover now opens from the More menu's onCloseAutoFocus (menu fully closed, focus not returned behind it) and the onFocusOutside workaround is gone. Pagination alone did not reproduce in Playwright. New e2e: pagination / e-ink change then Escape and outside tap close it. (2) Completed fallback only while the book still counts as finished and the newest goal row (tombstones included) is that completed goal; tests for re-read and removed later goal. (3) useLocalDayNow (midnight timer + visibilitychange) keys statsKeys.goalPlan by local day and passes now through; stats.tsx reuses it; hook test. (4) Edit measures from plan.dayStartWord, pace seeds from goal.dailyPercent, unchanged Save skips the replan; tested. (5) --goal-pending / --goal-met / --goal-progress per theme (light, dark, sepia #6e1a08/#064e3b, e-ink black) used by divider, tone classes, Done, fills, chip ring; chart plan line uses currentColor. (6) formatDayKey in utils/date-utils.ts (year when not current) used by goal UI and activity feed. (7) New goal opens on 1 month. (8) requireDayNumber / inclusiveDays in core day-key; goalState removed; Slider from @lesefluss/ui (thumbProps added for aria-valuetext); browse toggle is <Button variant=outline size=icon-lg>.

Nice-to-haves done: (9) daily lock clamps to MIN_GOAL_DAILY_PERCENT and recomputes days/finish; (10) chart origin from drawn series; history now runs to the plan's start (goal start or last replan) so there is no gap after a replan; (11) Edit hidden for unknown-length plans; (12) page mode: GoalDivider hides itself when its paragraph ends at a page bottom (it would land atop the next column and add a blank page to the chunk's last paragraph); checked in a layout effect before the chunk measures, and on paragraph resize; e2e searches page heights until the target paragraph ends within a divider's height of the page bottom and asserts hidden + no extra width; (13) shared GoalStat / DayCount, card bar from liveToday; (14) canHaveGoal / canStartGoal, useReadingGoalPlan(bookId|null), useReaderGoal hook; (15) Y_TICKS, typed seed, existing: …|null, merged paragraph imports; (16) removed isOverdue/remainingToday/isOnTrack, completeGoal/abandonGoal queries and hooks; (17) single query in getReadingGoalPlan; completeFinishedGoals stays in the read (see message); (18) 44px chip hit area, sr-only 'days', Custom chip only aria-expanded.

Checks round 1: turbo check-types 8/8 (capacitor vitest 128 files), core 177, web 93 (+204 DB-skipped). e2e affected set 48/48: reading-goal (3), appearance-persist (3), browse-mode, eink-mode, active-word-underline, search-jump, toc-jump, highlights-order, glossary-edit-delete, page-mode-*, reader-images-progress, import-large-epub.

Review (2026-10-19): 3 fresh-context passes (conventions; correctness; a11y/perf/theme) + planner Chrome pass. 18 findings fixed by impl (stuck Appearance popover after e-ink/pagination toggle = Radix Presence + e-ink animation strip, fixed by keying PopoverContent on isEinkMode; completed-goal fallback only while book still finished; plan query keyed by local day + midnight roll; pace edit no drift; goal colour tokens for light/dark/sepia/e-ink; year shown on non-current-year dates via formatDayKey; default 1-month preset; shared day helpers; ui Slider with aria-valuetext; page-mode divider hides when it would spill past a column). Planner re-verified: capacitor tsc + vitest 128 files / 1154 tests, core 177; Chrome: popover closes after e-ink toggle, divider black in e-ink and #6e1a08 in sepia, year shown. Impl e2e: 48/48 affected specs pass.

Device test follow-ups (2026-10-19): (a) Stale "vs plan" after a position-only move (TOC/search jump the reader stays at): the reader's unmount flush now invalidates statsKeys.goalPlansOf(bookId) (new key prefix) after the save commits, so the book page refetches the plan with the new position. Once per reader exit, not per save tick. e2e reading-goal 'a jump the reader stays at shows against the plan on the book page right away' (verified to fail without the fix). (b) Goal chart x-axis: axisTicks(hasHistory, span) labels the goal's start day (one after the plan's 0% anchor) when there is no history; with history the history start stays; last tick stays the finish. Unit test goal-chart-axis.test.ts.
<!-- SECTION:NOTES:END -->
