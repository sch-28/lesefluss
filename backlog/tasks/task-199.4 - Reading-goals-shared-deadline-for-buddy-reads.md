---
id: TASK-199.4
title: 'Reading goals: shared deadline for buddy reads'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 19:23'
updated_date: '2026-10-19 20:40'
labels:
  - feature
  - social
dependencies:
  - TASK-199.1
  - TASK-199.2
references:
  - CONTEXT.md
parent_task_id: TASK-199
priority: low
ordinal: 159000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Book clubs and buddy reads often read toward a date. Let a buddy read carry a shared deadline that members can adopt as their personal reading goal (TASK-199.1 goal model, deadline mode) for their copy of the book.

Open questions to settle with the product owner before implementing: who may set or change the deadline (creator only or any member), whether changing it updates members' adopted goals, and whether members see each other's on-track status on the live board (TASK-171.15) subject to the existing live-activity sharing switch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A buddy read can have a deadline that all members see
- [x] #2 A member can adopt the deadline as a personal goal in one step; adopting is never automatic
- [x] #3 A member's personal goal stays theirs: leaving the buddy read does not delete it
- [x] #4 Permission and update rules for the deadline follow the decisions recorded in the task notes
- [x] #5 Server-side checks prevent non-permitted members from changing the deadline, with tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Delegated by lesefluss-planner; product decisions final (see notes).

Found: buddy_read.target_date already exists (TASK-171): host-only setBuddyReadTargetDate + POST /api/social/buddy-read-target-date, shown to members (summary/detail targetDate, paceLine), with integration tests (host sets/clears, non-host rejected). It is reused as the shared deadline; no new buddy-read column or migration is needed. "Creator" maps to the stored host (the creator while they remain a member, else the host handover CONTEXT.md defines).

1. Core: move the plan-line math (daily words, pace finish day, plan line, ahead/behind) from apps/capacitor services/stats/reading-goal.ts into @lesefluss/core reading-goal.ts as pure functions over day numbers, and have planReadingGoal use them. Ahead/behind needs only the goal, word count, position and the member's local day: no sessions.
2. Server: getBuddyReadProgress adds per participant `goal: { aheadPercent, aheadDays } | null`. Filled only when the viewer and that member both share live activity and the member has an IANA time zone on their social profile (their local day); otherwise null. The member's goal comes from sync_reading_goals joined to sync_books on the same user_id and book_id (the member's buddy-read book), active, not deleted, book not deleted, not taken down (social_takedown). Position/word count from that sync_books row.
3. App, buddy-read screen: the Target date section becomes "Deadline" and shows for every member while a date is set (host keeps the date input + Clear, and can always set one). Members (host included) get Adopt: creates a deadline-mode goal on their own copy via createGoal with the deadline's local day. If an active goal exists on that book: same deadline -> "adopted" label; otherwise Adopt asks to replace first. No local book, finished book or unknown length -> no Adopt. Pure adoptState() decides.
4. App, live board: marker popover detail adds "goal +1.2 d" / "goal −0.5 d" from the participant's goal status when present.
5. Tests: web integration (host-only set/change already covered; add: member reads deadline, non-member cannot read progress, goal status gated by both sharing switches, by time zone, goal on a deleted / taken-down book or another book never shows, ahead/behind values); core unit tests for the moved plan-line functions; app unit tests for adoptState + adopt flow and markerDetail; e2e-app spec: host sets a deadline via API, member adopts on the buddy-read screen, goal card shows the deadline.
6. Notes: leaving a buddy read never touches the member's goal (it lives on their own book); deadline changes leave adopted goals alone and the screen offers Adopt again.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions (2026-10-19, product owner): only the buddy-read creator may set or change the deadline; members can only adopt it. When the deadline changes, members' adopted personal goals stay unchanged; members see the new date and can adopt it in one tap (opt-in, never automatic). Members' on-track status (ahead/behind) is shown on the live board only for members who have live-activity sharing switched on; hidden otherwise.

Security note from TASK-199.1 review: `sync_reading_goals.book_id` is client-supplied and never checked against `sync_books`. Any cross-user read of goals (buddy-read deadline, live board status) must join `sync_books` on the same user_id and exclude deleted/taken-down books, never trust the goal's book_id alone.

Implemented (2026-10-19). No new migrations: the deadline is the existing buddy_read.target_date (host-only setBuddyReadTargetDate, TASK-171). 'Creator' = the stored host, i.e. the creator while they remain a member, else the host handover in CONTEXT.md.

Core: goalDailyWords, paceFinishDay, goalPlanLine, goalAheadBehind moved to @lesefluss/core reading-goal.ts (app planReadingGoal uses them; behaviour unchanged, all plan tests pass). Server: lib/social/goal-status.ts memberGoalStatuses; getBuddyReadProgress participants gain `goal: { aheadPercent, aheadDays } | null`. Shown only when the viewer and the member both share live activity and the member has a valid IANA time zone (their local day places the plan line). The goal is read from sync_reading_goals inner-joined to sync_books on the same user_id + book_id (the member's buddy-read copy), book not deleted, left-joined social_takedown must be absent, goal active and not deleted; newest wins if two. No sessions needed: ahead/behind is position vs plan line.

App: pages/social/buddy-read-deadline.tsx replaces the host-only 'Target date' section with 'Deadline' (host: date input + Clear; members: 'by <date>' via formatDayKey). Every member, host included, gets Adopt -> createGoal(deadline mode, the deadline's local day) on their own copy; an active goal with another plan asks 'Replace your goal?' first (createGoal abandons it); same deadline shows 'my goal'; no local copy / finished / unknown length -> no Adopt. Live board marker popover adds 'goal +1.2 d' when the server sends a status. Leaving the read never touches the goal (it lives on the member's own book). A changed deadline leaves adopted goals alone; Adopt reappears because the targets differ.

Deadline day: the host stores the end of their chosen local day; each member adopts whichever local day that instant falls on, so members far east/west of the host can land one day apart.

Tests: web goal-status.integration (host-only set/change incl. a non-member, members-only read of deadline and progress, gating by viewer and member live sharing, missing/invalid time zone, goal on another or unknown book, completed/deleted goal, taken-down and deleted book, ahead/behind values) 6 tests; core reading-goal plan-line tests 5; app buddy-read-deadline 7 (adoptState + adopt/replace/adopted/host/hidden), markerDetail +1; e2e-app buddy-read-deadline.spec.ts (host sets via API, member adopts on the buddy-read screen, goal card on the book page).

Checks: turbo check-types 8/8 (capacitor vitest 133 files), core 182, web 304 incl. DB integration (temp DB dropped), e2e-app 14/14 (throwaway DB), dev e2e reading-goal 3/3.

Review round 1 fixes (2026-10-19): adoptState takes {book, goal, goalLoaded, deadline, today}; a passed deadline (deadline < today) or a still-loading goal is unavailable, the row says 'passed'. Stale goals: new POST /api/sync/wipe-goals (lib/sync-wipe.ts wipeReadingGoals); pushSync calls it after a push while syncStats is off, retried each push until it succeeds, re-armed when stats come back on (goals push in full then). /api/sync/wipe-sessions also deletes goals (wipeReadingStats, one transaction). Server skips a goal whose synced position counts as finished. Payload is { aheadDays } only (core BuddyReadMemberGoal); CONTEXT.md Live board lists what is shared. Deadline shows once: header pace line removed; the Deadline section shows the date via formatDeadline (formatDayKey with year rule) plus the group pace until adopted, then only 'my goal'. Buddy-read card and book page use formatDeadline too. goal-status: today clamped to planStartDay, desc(goalId) tie-break, Map<userId, zone> via shared validTimeZone + dayOf (dayKeyIn removed), rounds once. getBuddyReadProgress catches a goal-standing failure (warn, empty map). BuddyReadTargetDateBodySchema: yesterday .. ~5 years ahead -> 400. stats/reading-goal isTodayMet branch uses paceFinishDay. Participant-row goal status skipped (facts line already truncates; the detail payload has no goal).

Open: 'Delete reading stats' deletes local sessions only; local goals stay and re-push on the next sync, so the server goal wipe there lasts until then unless stats sync is off.

Checks after round 1: turbo check-types 8/8, core 184, web 306 incl. DB integration (temp DB dropped), e2e-app 14/14, dev e2e reading-goal 3/3, biome clean on touched files.

Review (2026-10-19): 3 fresh-context passes (conventions; correctness; security/privacy) + planner Chrome pass on a throwaway e2e-app server (cy host, dee member): adopt -> '✓ my goal', goal chip + divider on dee's copy, single deadline display. Fixes: no adopt for passed deadlines (+ 'passed' label) or while the goal query is pending; server goals wiped when stats sync is off (POST /api/sync/wipe-goals, called after a push while syncStats is off) and by wipe-sessions; finished members show no status; payload reduced to aheadDays only (CONTEXT.md documents what is shared); deadline shown once via formatDeadline; today clamp + tie-break match the app; goal-status failure isolated; target-date bounds (yesterday..~5y). Planner re-verified: capacitor tsc + vitest 133 files / 1200 tests, core 184, web tsc; impl: web 306 incl. DB integration, e2e-app 14/14. Open product calls (not blocking): host vs strict creator for deadline edits (implemented: host, incl. handover); whether 'Delete reading stats' should also delete local goals (today local goals survive and are pushed back while stats sync is on).

2026-10-19 user decisions: deadline edits stay host-based (incl. handover), no created_by column. "Delete reading stats" keeps local goals as today (no change).
<!-- SECTION:NOTES:END -->
