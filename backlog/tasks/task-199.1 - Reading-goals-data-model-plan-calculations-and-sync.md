---
id: TASK-199.1
title: 'Reading goals: data model, plan calculations and sync'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 19:23'
updated_date: '2026-10-19 20:20'
labels:
  - feature
  - stats
  - sync
dependencies: []
references:
  - apps/capacitor/src/services/db/schema.ts
  - apps/capacitor/src/services/db/queries/stats.ts
  - apps/capacitor/src/services/stats/book-summary.ts
  - apps/capacitor/src/utils/reading-time.ts
  - CONTEXT.md
modified_files:
  - packages/core/src/reading-goal.ts
  - packages/core/src/day-key.ts
  - packages/core/src/__tests__/day-key.test.ts
  - packages/core/src/streak.ts
  - packages/core/src/books.ts
  - packages/core/src/sync.ts
  - packages/core/src/index.ts
  - apps/capacitor/drizzle/0038_reading_goals.sql
  - apps/capacitor/drizzle/meta/_journal.json
  - apps/capacitor/src/services/db/schema.ts
  - apps/capacitor/src/services/db/queries/reading-goals.ts
  - apps/capacitor/src/services/db/queries/index.ts
  - apps/capacitor/src/services/db/queries/books.ts
  - apps/capacitor/src/services/db/queries/series.ts
  - apps/capacitor/src/services/db/hooks/use-reading-goals.ts
  - apps/capacitor/src/services/db/hooks/index.ts
  - apps/capacitor/src/services/db/hooks/query-keys.ts
  - apps/capacitor/src/services/stats/reading-goal.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/services/stats/__tests__/reading-goal.test.ts
  - apps/capacitor/src/services/db/__tests__/reading-goals.test.ts
  - apps/capacitor/src/services/sync/__tests__/goal-sync.test.ts
  - apps/capacitor/src/services/sync/__tests__/goal-sync-gating.test.ts
  - apps/capacitor/src/services/sync/__tests__/content-quota.test.ts
  - apps/capacitor/src/services/sync/__tests__/settings-sync.test.ts
  - apps/web/drizzle/0036_reading_goals.sql
  - apps/web/drizzle/meta/_journal.json
  - apps/web/src/db/schema.ts
  - apps/web/src/lib/sync-goal-upsert.ts
  - apps/web/src/lib/sync-goal-upsert.integration.test.ts
  - apps/web/src/lib/account-deletion.ts
  - apps/web/src/routes/api/sync.ts
  - CONTEXT.md
parent_task_id: TASK-199
priority: medium
ordinal: 156000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Foundation for per-book reading goals (see parent TASK-199 for the agreed product rules). Provides the stored goal, the pure plan calculations every UI surface uses, and cross-device sync. No UI here.

A goal belongs to one book and has its own lifecycle (active, completed, abandoned, replanned), so it lives in its own table rather than as columns on `books`: changing a goal must not bump the book's metadata revision, and TASK-199 buddy-read deadlines will later link to it. One active goal per book.

Stored per goal (shape is a suggestion, adjust to existing conventions): book id, created/started at, start position, target date, daily percent, missed-day mode (raise daily target | push finish date), status, updatedAt for last-write-wins.

Plan calculations must be pure functions with tests, in `@lesefluss/core` if the server or other apps need them, else next to `services/stats/*`. They answer: today's target (% and minutes at the reader's pace for this book, falling back to the global measured speed, then the 225 wpm default as `readingPace` does), progress today, whether today's target is met, ahead/behind vs the original plan line (in % and in days), the projected finish date, and both per-book counters (days target met, days read).

Start-of-day position comes from reading sessions (`reading_sessions.endWord` of the last session before local midnight, else the goal's start position), so it is consistent across devices once sessions sync. Verify whether reading on the ESP32 / rsvpnano device produces sessions; if it only moves `books.wordPosition`, document how that reading is counted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A goal can be created, updated, completed and removed for a non-serial book in the local database, and at most one goal per book is active
- [x] #2 Goals sync to and from the server with last-write-wins, including deletes, and work without an account
- [x] #3 Deadline mode: a missed day raises the following days' daily target so the target date is still met
- [x] #4 Pace mode: a missed day moves the projected finish date and leaves the daily target unchanged
- [x] #5 Switching an existing goal between the two modes keeps progress and recalculates from today
- [x] #6 Today's target does not change while reading during the same local day
- [x] #7 Ahead/behind is reported in percent and in days against the original plan line
- [x] #8 Reading past 100% of today's target is credited, and reaching the end of the book completes the goal
- [x] #9 Counters for days target met and days read are computed per book and are independent of the global streak
- [x] #10 Edge cases covered by unit tests: target date today or in the past, book already past target, goal created mid-day, local day boundaries around midnight and DST, unknown word count
- [x] #11 CONTEXT.md gains a Reading goal entry defining the terms used (goal, daily target, on track, the two modes)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Delegated by lesefluss-planner (product rules fixed in TASK-199).

Data model (one table, device + server)
- Local SQLite `reading_goals` (migration 0038): id, book_id, mode ('deadline'|'pace'), status ('active'|'completed'|'abandoned'), started_at + start_word (goal origin, for counters), plan_start_date (YYYY-MM-DD local) + plan_start_word (baseline of the plan line; moved by a replan / mode switch), target_date (YYYY-MM-DD), daily_percent (real), carried_days_met (days met under earlier plan parameters), completed_at, deleted (tombstone), created_at, updated_at (LWW).
- Dates are local calendar keys, so a goal means the same day on every device.
- One active goal per book: createGoal abandons the previous active goal; sync pull resolves concurrent creations (newest created_at stays active, others abandoned + restamped so the fix propagates).
- Completion: SQLite trigger on books.word_position crossing the finished threshold (95%, same rule as finished_at) completes the active goal. No extra bridge round-trip on position saves, and covers BLE device sync + sync pull.
- deleteBook tombstones the book's goals (pushed as deletes); hardDeleteBook removes them.
- Server: `sync_reading_goals` (PG migration 0036), keyed (user_id, goal_id). Upsert is LWW on updated_at (clamped to server now). No tombstone-on-omission. `readingGoals` optional in payload: absent (older clients) never touches goals. purgeCloudData removes them.
- Core: READING_GOAL_MODES/STATUSES + SyncReadingGoalSchema in @lesefluss/core.

Plan math (pure, apps/capacitor/src/services/stats/reading-goal.ts)
- Inputs: goal, book {wordCount, wordPosition}, sessions for the book, per-book wpm, global wpm, now.
- Start-of-day position S(d): endWord of the last session that ended after the goal started and before local midnight of d, else the goal's start position (plan_start_word on the baseline day).
- Daily target (fixed per local day): deadline = ceil((W - S) / daysLeft incl. today); pace = dailyPercent of W, capped at remaining. Target date today or past -> everything remaining is due today (overdue flag).
- Progress today = position - S; met when position >= S + target. Reading past the target is credited (feeds ahead/behind, lowers later deadline targets).
- Plan line from the baseline: deadline straight to 100% at end of target date; pace dailyPercent/day.
- Ahead/behind (words -> % and days via plan slope): if position >= plan(end of today) -> ahead by the excess; else min(0, position - plan(end of yesterday)). So an on-track reader shows 0 until today's portion is done, and only unfinished past days count as behind.
- Projected finish: deadline = max(target date, today); pace = day remaining work finishes at dailyPercent/day.
- Counters: days read = local days with a session for the book since goal start; days target met = carried + days since baseline whose end-of-day position reached that day's target.
- Series for chart: plan line (date, %) and actual end-of-day position (date, %).
- Minutes: target words / pace (book wpm -> global measured -> 225, via readingPace).
- Unknown word count (0) -> plan returns { kind: 'unknown-length' }.
- Mode switch / edit (replan): carry days met so far, rebaseline at today's start-of-day position; deadline->pace keeps today's daily %, pace->deadline takes the projected finish as target date.

Queries + sync
- queries: getActiveGoal, getGoalsForBook, getAllGoalsForSync, createGoal, updateGoal, completeGoal, abandonGoal, deleteGoal (tombstone), upsertGoalsFromServer, resolveActiveGoalConflicts, getGoalSessions.
- Service loadReadingGoalPlan(bookId, now) gathers inputs for the UI; readingGoalKeys added; pull invalidates.
- Push: goals for pushed books (incl. tombstones). Pull: LWW merge, server tombstone -> local hard delete, orphan guard.

Tests
- vitest: plan math (all AC #10 edges incl. Europe/Berlin DST), replan/mode switch, queries on real SQLite (create/one-active/complete trigger/delete), sync merge helpers.
- Web: goal upsert integration test (skips without DATABASE_URL) + payload schema test.

Docs: CONTEXT.md "Reading goal" entry; ESP32/rsvpnano finding documented in notes and CONTEXT.

Revision during implementation: the completion trigger was replaced by `completeFinishedGoals()` (see notes). Query names as built: upsertGoals, hardDeleteGoals, getReadingGoalPlan (loader), replanGoalById; query key statsKeys.goalPlan(bookId).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented as planned, with two deviations: (1) No SQLite trigger for auto-completion. The Capacitor sqlite plugin re-splits trigger bodies with its own line/';' parsing, and a failed migration blocks the DB from opening, which can't be verified off-device. Instead `completeFinishedGoals()` is one UPDATE over the library, run on every `getReadingGoalPlan` read and after every sync pull. (2) Statuses are active|completed|abandoned. A replan edits the goal in place (rebaselines the plan line, carries days met), so no 'replanned' status was needed; a new goal replacing an active one abandons it.

ESP32 / rsvpnano: verified they produce NO reading_sessions. book-sync-context only calls updateBook(wordPosition, lastRead) on BLE connect / position notify. So device reading moves the position but not the start-of-day position: it counts toward today's progress until an in-app session follows it, and earlier days' 'met' and 'days read' counters miss it. Documented in CONTEXT.md (Reading goal > Start-of-day position).

Midnight-spanning session: its checkpointed endedAt moves past midnight, so the start-of-day rule uses the session's startWord for a session running across midnight. One-time shift within the first checkpoint after midnight; otherwise today's target is stable.

Finish rule: plan targets 100% of words; completion uses the app-wide finished threshold (95%, same as books.finished_at).

Sync: readingGoals is optional in SyncPayloadSchema with no default, so clients that predate goals never touch server goals. Server upsert is LWW (setWhere excluded.updated_at > existing) with updatedAt clamped to server now; no tombstone-on-omission. Pull: buildGoalMerge (pure) -> upsert/hard-delete, then resolveActiveGoalConflicts (newest createdAt stays active, others abandoned + restamped).

Data-layer hooks added for 199.2 (queryHooks.useReadingGoalPlan, useCreateReadingGoal, useReplanReadingGoal, useComplete/Abandon/DeleteReadingGoal); plan query key is statsKeys.goalPlan(bookId) so session writes refresh it.

Checks: turbo check-types 8/8 green (tsc all packages + capacitor vitest 124 files / 1119 tests). core vitest 169 pass. web vitest 298 pass incl. integration tests against a throwaway Postgres DB (migrated with drizzle-kit, dropped afterwards). Root `pnpm check-types` biome step fails only on pre-existing issues: gitignored artifacts (apps/capacitor/e2e-app/.auth/*.json, test-results/.last-run.json) and lint in untouched files; all changed files pass biome.

Review round 1 (lesefluss-planner) fixed: (1) one finished rule: core isFinishedPosition (raw, unrounded) + app isFinishedSql in queries/books.ts, used by updateBook finished_at stamp, backfillFinishedAt, getSeriesActivity and completeFinishedGoals; plan uses isFinishedPosition. (2) finishing day credited: isTodayMet/remainingToday and the counter treat the day the position first becomes finished as met. (3) createGoal throws on an already-finished book. (4) readingGoals push and pull gated on settings.syncStats, like sessions (goal-sync-gating.test.ts). (5) server updatedAt clamp removed (matches sync-book-upsert). (6) day-key helpers moved to packages/core/src/day-key.ts (dayNumberOf now rejects impossible dates), used by streak.ts, reading-goal.ts and the zod schema; DATE_KEY_REGEX removed. (7) getGoalSessions/updateGoal/getActiveGoal/getGoalsForBook out of the queries barrel; getGoalSessions unexported. (8) goal schema bounds: int fields <= 2^31-1, epoch ms <= 8.64e15, day keys must be real dates. (9) interfaces -> types. (10) comment on getAllGoalsForSync removed. (11) new hooks banner removed.

Checks after round 1: turbo check-types 8/8; capacitor 125 files / 1126 tests; core 177; web 297 incl. integration on a throwaway Postgres DB (dropped). Changed files pass biome.

Review (2026-10-19): 3 fresh-context passes (conventions, correctness, security) + Chrome smoke (0038 migrates in web build, no console errors). 11 findings fixed by impl: shared finished rule (isFinishedPosition / isFinishedSql at all 4 SQL sites), finishing day credited, createGoal rejects finished books, goal sync gated on syncStats like sessions, server updatedAt clamp removed (matches books), day-key helpers moved to core/day-key.ts, dead barrel exports removed, zod bounds on ints/timestamps/date keys. Re-verified by planner: capacitor goal/sync/stats tests 296 pass, core 177 pass, tsc clean. Not done by decision: per-user server row cap / tombstone GC (same as highlights/sessions).
<!-- SECTION:NOTES:END -->
