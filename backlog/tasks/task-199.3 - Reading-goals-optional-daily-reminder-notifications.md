---
id: TASK-199.3
title: 'Reading goals: optional daily reminder notifications'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 19:23'
updated_date: '2026-10-19 20:06'
labels:
  - feature
  - notifications
dependencies:
  - TASK-199.1
  - TASK-199.2
parent_task_id: TASK-199
priority: low
ordinal: 158000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Optional per-goal reminder at a time the reader picks, when today's target is not yet met. Off by default.

The existing notification setup is server push (`@capacitor/push-notifications`, used for social events). It cannot serve no-account users and needs the network, while goals must work fully offline and without an account. Decide between local notifications (`@capacitor/local-notifications`, scheduled on device) and server push, and record the reasoning; local is the expected choice. Reminders should be cancelled or skipped once today's target is met, including when it was met on another device after sync.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A reminder can be switched on per goal with a chosen time, and is off by default
- [x] #2 No reminder fires on a day the target was already met
- [x] #3 Reminders work without an account and without network
- [x] #4 Notification permission is requested only when the reader turns a reminder on, and a denied permission is shown in the setting
- [x] #5 Removing or completing a goal cancels its reminders
- [x] #6 The chosen mechanism (local vs push) and why is recorded in the task notes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Delegated by lesefluss-planner. Local notifications (@capacitor/local-notifications), reminder time stored on the goal and synced; scheduling device-local.

1. Plugin: `pnpm add @capacitor/local-notifications` in apps/capacitor (no cap sync; report native file changes). Lazy-imported like push so the web build never loads it.
2. Data: nullable `reminder_time` ("HH:MM") on reading_goals: local migration 0039, server migration 0037, SyncReadingGoalSchema (optional, nullable, HH:MM regex), push/pull mappers, server upsert + GET. createGoal takes an optional reminder time; new query setGoalReminder(goalId, time|null) stamps updatedAt (syncs LWW with the goal).
3. Pure scheduling (services/goal-reminders/schedule.ts): planReminders({ goals: [{goal, plan, title}], now, horizonDays }) -> notifications for today (only if the time has not passed and today's target is not met) and the next few days up to the projected finish; nothing for completed / unknown-length goals or goals without a time. Body "today 1.3% · ~10 min", title = book title, extra {kind, bookId}. Stable 31-bit ids from goal id + date.
4. Sync (services/goal-reminders/index.ts): syncGoalReminders() loads active goals with a time, their plans and titles, cancels every pending goal reminder, schedules the new set. Android channel created once. Native only; no-op on web.
5. Triggers (root hook useGoalReminders): app start, app resume, local day roll (useLocalDayNow), any invalidation of stats or book queries (session flush, sync pull, goal edits/removal, book delete), and the reader's live 'met' flip (cancels today once the target is passed while reading). Debounced. Tap listener opens /tabs/reader/$bookId.
6. UI: reminder row in the goal sheet (switch + time input), off by default; permission asked only when switching on; denied shown in the row. Edit mode saves the reminder without a replan when only it changed. Hidden on web.
7. Tests: vitest for planReminders (days, skip met/past, horizon, finish, day roll), syncGoalReminders with a mocked plugin (cancel on remove/complete, reschedule), DB query + sync schema round trip; e2e: row absent on web.
8. Notes: mechanism decision (AC #6), native changes, web behaviour.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Mechanism (AC #6): local notifications via @capacitor/local-notifications, scheduled on the device. Server push (@capacitor/push-notifications, used for social) needs an account, a registered token and the network at send time, and the server does not know today's progress until the next sync; goals must work fully offline and without an account, and the 'already met today' check depends on reading that may not have synced yet. Local scheduling reads the local plan, so it works signed out and offline, and a met day can be dropped on the spot. The reminder time itself lives on the goal (reading_goals.reminder_time, synced) so it follows the goal to other devices; each device schedules its own.

Scheduling: no repeating alarm. Today (if the time has not passed and today's target is not met) plus the next days up to REMINDER_HORIZON_DAYS = 4, stopping at the projected finish, each its own notification with a stable id. Rebuilt (cancel pending goal reminders, schedule the new set) on app start, resume, local day roll, any invalidation of stats/books queries (session flush, sync pull incl. a met state from another device, goal edit/removal, book delete) and when the reader's live position meets today's target. Later days repeat today's target text as an estimate; the app corrects it whenever it runs that day. Without notification permission nothing is scheduled and leftovers are cancelled.

Android: channel 'goal-reminders' (default importance). isExactNotification: false on every notification: the plugin's default (exact) makes schedule() open the 'Alarms & reminders' settings screen on Android 12+; with it off the plugin uses setAndAllowWhileIdle (inexact).

Native: `pnpm add @capacitor/local-notifications@^8.3.1` changed only apps/capacitor/package.json and pnpm-lock.yaml; nothing under android/. Follow-ups that need native work (not done, per instructions): `npx cap sync android` to register the plugin; a monochrome drawable for the small icon plus `plugins.LocalNotifications.smallIcon` in capacitor.config.json (without it Android shows the system info glyph); the plugin's manifest merges SCHEDULE_EXACT_ALARM, which we do not use and could be removed with tools:node="remove" to avoid a Play Console declaration.

Web: the reminder row is hidden (areRemindersSupported() = native only); the plugin is lazy-imported so the web build never loads it. e2e asserts the row is absent.

Checks: turbo check-types 8/8 (capacitor vitest 131 files), core 177, web 298 incl. DB integration (temp DB, dropped). New tests: goal-reminders/schedule (11), goal-reminders/sync with mocked plugin (5), goal-reminder-row (3), DB reminders (3), sync schema reminder round trip, web upsert reminder test. e2e: reading-goal (3, incl. row hidden on web), appearance-persist, reading-session, onboarding, auto-open-last-book: 9/9.

Review round 1 fixes (2026-10-19): (1) reminder row shows 'notifications off on this device · allow' (or 'notifications blocked · system settings' when denied) whenever a reminder is on but permission is not granted, and after a refused request; tapping asks again. Covers Android 13+ prompt-with-rationale, a revoked grant and a time synced from another device. (2) launchHasIntent waits for push and reminder tap listeners (two gates, 3 s cap); markNotificationTapReceived replaces markPushTapReceived. (3) native files, see below. (4) reminderTime is required-nullable in SyncReadingGoalSchema; upsert/mappers no longer default it. (5) requestReminderSync after the sync pull's invalidations and in goal mutations' onSuccess; cache subscription kept as fallback. (6) the reader triggers a rebuild from onPositionSavedRef (after the write commits) when the saved word meets today's target. (7) reminderBookId checks /^[0-9a-f]{8}$/ with `in` narrowing; a tap opens the reader only for an existing, non-deleted book, else the library. (8) today's shown reminder is removed from the shade when the day is met or the goal is done (shownRemindersToClear + removeDeliveredNotifications). (9) percentLabel/minutesLabel moved to utils/reading-time; services/notification-permission.ts shares NotificationPermission, toNotificationPermission(PermissionState) and CHANNEL_IMPORTANCE_DEFAULT with push; localDateOfKey in utils/date-utils used by formatDayKey, presetDays, buddy-read's date input and the scheduler. (10) cleanups done.

Native files changed (go-ahead from planner, file edits only, no cap sync/gradle/device): android/app/src/main/res/drawable/ic_stat_lesefluss.xml (bitmap wrapping @mipmap/ic_launcher_monochrome, white on transparent); capacitor.config.json plugins.LocalNotifications { smallIcon: ic_stat_lesefluss, iconColor: #d9543a } (reaches Android only on the next cap sync); android/app/src/main/AndroidManifest.xml xmlns:tools + SCHEDULE_EXACT_ALARM tools:node=remove.

Known limits (documented, not fixed): reminders that came due while the phone was off are re-posted by the plugin's boot receiver about 15 s after boot, with the text they were scheduled with (possibly yesterday's target). The horizon is 4 days, so without opening the app reminders stop after the fourth day. reminder_time rides the goal row's last-write-wins: toggling the reminder on one device and replanning on another before they sync keeps only the later row, so a toggle can be lost.

Checks round 1: turbo check-types 8/8 (capacitor vitest 132 files), core 177, web 298 incl. DB integration (temp DB dropped). e2e: reading-goal, auto-open-last-book, onboarding, reading-session, appearance-persist, sign-in-password, sign-in-phone, position-durable-resume, browse-mode: 25/25.

Review (2026-10-19): 3 fresh-context passes (conventions; correctness; security/sync/Android) + Chrome (row hidden on web, plugin not loaded, no errors). 11 findings fixed by impl (permission hint for prompt/rationale/revoked/synced cases, launch gate waits for reminder listener, small icon drawable + config, SCHEDULE_EXACT_ALARM removed via tools:node, reminderTime required-nullable in sync schema, explicit reschedule after sync pull + mutations + committed met save, tap target validated + deleted-book fallback, delivered reminders cleared when met, shared notification-permission + date helpers). Planner re-verified: capacitor tsc + vitest 132 files / 1187 tests, core 177. NOT verified on device: needs `npx cap sync android`, build, and a device test by the product owner (delivery, small icon, warm + cold-start tap, no fire after target met). Status stays In Progress until then. Release note: ship 199.1-199.3 in one release (reminderTime is required in the goal sync schema).

Device test follow-up (2026-10-19): status-bar icon change ON HOLD (user re-checking). A cropped alternative exists outside the repo: per-density PNGs (24/36/48/72/96 px, 1dp padding) rendered from resources/logo.svg recoloured white; the repo keeps the original drawable/ic_stat_lesefluss.xml. Device build: run `npx cap sync android` from inside apps/capacitor (from the repo root with --prefix it fails with "android platform has not been added yet"), then `cd android && ./gradlew assembleDebug`.

Status-bar icon: dropped (2026-10-19). The user checked notification history on the device and the original icon is fine; drawable/ic_stat_lesefluss.xml stays, the cropped alternative was discarded.

Device test (2026-10-19, Pixel 8 Pro, debug APK via adb): reminder delivered in background (inexact window, ~1.5 min late, as designed); cold-start tap opened the right book's reader and cleared the notification; meeting today's target cancelled today's alarm, next 3 days stayed scheduled. Status-bar icon confirmed fine by the user (notification history). Warm tap not separately exercised (OS had killed the process). Follow-ups fixed from the test: stale goal plan after a position-only change (invalidate on reader exit), chart first tick showed the day before the goal start.
<!-- SECTION:NOTES:END -->
