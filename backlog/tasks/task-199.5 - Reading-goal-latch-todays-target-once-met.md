---
id: TASK-199.5
title: 'Reading goal: latch today''s target once met'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 19:40'
updated_date: '2026-10-19 20:06'
labels:
  - reading-goals
dependencies: []
parent_task_id: TASK-199
priority: medium
ordinal: 160000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today's target is met when the current position passes the start-of-day position plus today's target. If the position later moves back (e.g. switching to e-ink forces page mode and snaps back a bit, or the user jumps back/browses), the target flips back to un-met: chip ring, divider, card stat, days-met counter and reminder suppression all regress. Observed in Chrome during the 199.2 pass.

User decision 2026-10-19: once today's target is met it stays met for that day. Base "met" on the furthest position reached today (from today's sessions / committed saves), not the current position.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Today's progress for the goal uses the furthest word position reached today, so moving back does not un-meet the target
- [x] #2 Chip ring, in-text divider, book-page card, days-met counter and reminder scheduling all agree on the latched value
- [x] #3 The divider does not replay its green animation after a backward move and forward again on the same day
- [x] #4 Next day starts fresh: target computed from start-of-day position as before
- [x] #5 Unit tests cover backward move after meeting the target, and backward move before meeting it (no false met)
- [x] #6 e2e covers meeting the target then jumping back in the reader, if feasible in the existing reading-goal spec
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Delegated by lesefluss-planner. 1. planReadingGoal: furthest position per day = max(end-of-day / live position, ends of that day's sessions since the goal and plan start); today's progress, isTodayMet and days-met use it; new plan field furthestTodayWord. 2. liveToday counts from max(live word, plan.furthestTodayWord) and keeps plan.isTodayMet. 3. useReaderGoal latches live words not yet saved (reset per day/start-of-day). 4. Divider: green animation only on a pass seen happening while mounted (new --celebrate class), so remounts and back/forward never replay it. 5. Ahead/behind stays on the current position. 6. Tests: unit (plan, liveToday, divider) + e2e reading-goal scrolls back after meeting.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented 2026-10-19. No migration: sessions + position give it. services/stats/reading-goal.ts makeFurthestOn: furthest per local day from session endWords (sessions ending at/after the goal start and plan-start midnight) and the day's end (live position today). progressToday, isTodayMet, daysTargetMet (past days too) use it; finishing that day also judged on the furthest point. dayStartWord/dailyTarget unchanged, so the next day starts from where the previous one ended (AC #4). Plan exposes furthestTodayWord; chip/divider (liveToday), card (progressToday), counter (daysTargetMet) and reminder scheduling (isTodayMet) all read it (AC #2). Reader: useReaderGoal keeps the furthest live word per plan day so an unsaved snap back also stays met. Divider: animation moved to reader-goal-divider--celebrate, set only when passed flips true while mounted; remounts (virtualized scroll, page/e-ink switch) show it green without replaying.

Ahead/behind stays on the current position (planner's default). It can read slightly behind while today shows met after a snap back; the chip shows met plus the vs-plan number, which is truthful (current position vs plan line), so I kept it.

Caveat by design: furthest reached means a jump ahead that gets saved or ends a session (e.g. search jump forward then back) also counts toward today.

Tests: stats reading-goal 'latching today's target' (3: back after met stays met, back before met no false met, past day stays met + next day fresh); goal-model liveToday latch (1); reader __tests__/goal-divider.test.tsx (2). e2e reading-goal: after meeting, scroll back to word <10, chip stays met and divider passed. Checks: turbo check-types 8/8, capacitor vitest 134 files / 1206 tests, e2e reading-goal + eink-mode 13/13, biome clean on touched files.

Review round 1 redesign (2026-10-19). Migrations: capacitor 0040_reading_session_furthest_word (reading_sessions.furthest_word integer, nullable), web 0038_reading_session_furthest_word (sync_reading_sessions.furthest_word). Sync schema: SyncReadingSession.furthestWord optional + nullable. Server upsert last-write-wins with COALESCE so an older client's null never wipes a stored value; local pull upsert likewise.

SessionTracker: furthest = end of the highest read span (startPos when none) written to every row, so it follows rewindTo/discard and never counts a jump or moving back. onFurthest(sessionId, word) reports the open sitting's value; null while it has read nothing (e.g. opened at a read-from-here jump target) or when discarded; finalize keeps it. Sittings split at local midnight (tick/markActivity/reconcile/finalize): the old row closes with endedAt before midnight (updatedAt stays real for the push watermark), a new sitting opens at the same spot with the credit budget carried over.

Plan: planSessions filters once (goal start, plan start) for makeStartOfDay (memoized per day) and makeFurthestOn (furthestWord ?? endWord per day, never below the day's start). isDayMet(start, furthest, target, wordCount) shared by isTodayMet, the days-met loop and liveToday; finishing that day judged on the credited furthest too. The live position no longer feeds furthestTodayWord.

Reader: useReaderGoal keeps each open/finished sitting's credited furthest for (book, day) from the tracker callback; liveToday(plan, word, wordCount, readTo) latches on max(plan.furthestTodayWord, readTo) and shows a jump ahead as met only while the position is there (non-sticky). Chip daysMet +1 reads the same today.isMet. GoalDivider/GoalDividerProp/ReaderGoalDivider moved to pages/reader/goal-divider.tsx; data-celebrate attribute; an sr-only role=status announces "Today's target met" on the celebrate edge only. Goal card gets data-met.

e2e: reading-goal now reads at tracker pace, scrolls back, then checks the book card stays met on the book page and after reload; new spec: search jump far ahead + read from here, then back, does not meet. Fixed reader.wheel page object: it picked the goal paragraph (absolute divider overflows) as the scroll container.

Checks: turbo check-types 8/8, capacitor vitest 134 files / 1215, core 184, web 308 incl. DB integration (new session-furthest test; temp DB dropped), e2e reading-goal + eink-mode + browse-mode + search-jump 25/25.

Review round 2 (2026-10-19). Design: a day's furthest point = max(that day's sessions' furthestWord ?? endWord, skipping rows with nothing read; the day's end position: book.wordPosition today, startOfDay(day+1) for past days; the day's start). Jump and back: not met; jump and stay: counts (as before 199.5); device (BLE) reading counts again via the saved position. liveToday: isMet/fraction/progress all from isDayMet over max(plan.furthestTodayWord, furthestRead, live word); the card's number, minutes, bar and data-met all read liveToday; chip daysMet +1 follows today.isMet.

Limit: device-only reading on a past day still cannot be reconstructed — no session or position history is kept, and startOfDay is session-based, so the next day's start does not move either. Needs device position samples or synthetic sessions on applyDevicePosition (product call, raised with the planner).

Tracker: day key instead of dayEndsAt (several midnights, time zone change). splitAtMidnight(now, suspended) runs first in tick/markActivity (before lastActivityAt moves)/reconcile (both branches)/rewindTo/finalize. Reading straight through (active, not suspended, activity within SOFT_IDLE_MS): settle to midnight, new sitting from local day start at the same spot. Otherwise settle to min(midnight, lastActivityAt) and open nothing; the next activity starts a sitting then (correct startedAt, no empty sitting, so finalize's noise-floor warn no longer fires). Split does not retract the flushed sitting. settleActive(until) replaces the 5 copies; throttle branch collapsed. discard() of a persisted row calls opts.remove → local delete + /api/sync/delete-session (best effort; offline, an already pushed row can come back on pull). Rows rewound to nothing write furthestWord null.

Accepted trade-off: a sitting crossing midnight becomes two rows, so session counts go up by one and longest/average session get shorter.

Naming: tracker onFurthestRead, hook reportFurthestRead / furthestReadToday (null when nothing reported), liveToday(plan, word, wordCount, furthestRead). core sync: pgInt above the session schema, used for startWord/endWord/furthestWord. e2e: new dev hook __lesefluss_e2e_session_ticks + reader.waitForTrackerTick replace fixed waits; resize wait is expect.poll on the chunk bottom; divider height measured while shown (no fallback); custom-date chip found by role and name (it already has the accessible name 'Custom date', an aria-label would shadow it); page object uses ['auto','scroll'].includes(overflowY). Divider edge detection moved to a layout effect.

Checks: turbo check-types 8/8, capacitor vitest 135 files / 1228, core 184, web 308 incl. DB integration (temp DB dropped), e2e reading-goal + eink-mode + browse-mode + search-jump + reading-session + session-pause 30/30.

Review round 3 (2026-10-19). (1) Clock/zone moving back a day while reading: the old sitting settles to its last activity, the new one opens at max(startOfLocalDay(now), min(endOfDay(old day), now)) = now; lastActivityAt pulled back to now. (2) Reading-through split writes endedAt = end of day - 1, so duration stays within the row's span. (3) Discarded persisted row: server delete first, then local; on failure the row stays in both places (logged). (4) reading-goal.ts makeFurthestOn comment and CONTEXT.md now say device-only reading counts today only; a past day read only on a paired device is lost (open product question, nothing built). (5) daysMetWithToday(plan, today) in goal-model, used by the chip and the card's days met.

Checks: tsc clean, capacitor vitest 135 files / 1231 (tracker +2: backward clock, reading-through endedAt; goal-model +1 days met), e2e reading-goal + reading-session + session-pause 9/9, biome clean.

Review (2026-10-19, planner): round 0 + 3 review rounds. R1 (3 fresh passes): latch lived only in reader memory (session endWord overwritten on move back) and counted jumps -> redesign: reading_sessions.furthest_word (local 0040 / server 0038, sync optional+nullable, COALESCE LWW), credited-span furthest, midnight split, discard deletes persisted row, a11y status, GoalDivider own file. R2 (3 passes): paired-device reading (position only) stopped counting -> day furthest = max(credited furthest, day end position, day start); split hardening (idle/suspend, reconcile, multi-midnight, TZ, no retraction), naming, e2e waits via dev tick hook. R3 (verify pass): backward clock jump, split endedAt, server-first discard delete, daysMetWithToday. Planner re-verified: app tsc + vitest 135 files / 1231, core 184, web tsc; impl: web 308 incl DB integration, e2e 30/30 + 9/9. Chrome: card/chip met after scroll back + reload, migration applies, no console errors. Known limit: a past day read only on a paired device can't be reconstructed (no dated position record); user decision pending (leave / device sessions / position log). Release note: session sync schema gains furthestWord; sittings crossing midnight become two rows.

2026-10-19 user decision: leave the paired-device past-day limit as is (no device sessions, no position log).
<!-- SECTION:NOTES:END -->
