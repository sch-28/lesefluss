---
id: TASK-171.12
title: Live reading races in a buddy read
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-25 22:12'
updated_date: '2026-09-28 16:16'
labels:
  - social
  - app
  - web
dependencies:
  - TASK-171.8
  - TASK-171.9
  - TASK-171.4
documentation:
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
  - backlog/decisions/ADR-0004-friends-only-book-sharing.md
parent_task_id: TASK-171
priority: low
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A synchronous, gamified mode on top of buddy reads (supersedes archived TASK-65): participants start a timed session together and see each other's race progress move live, with a leaderboard and a finish-line ping. Fits Lesefluss's RSVP speed-reading identity.

Depends on TASK-171.8 (buddy read with shared content origin, so positions compare exactly, ADR-0002/ADR-0004) and TASK-171.9 (discussion, where results are posted). Race invites go through the TASK-171.4 inbox only; they are not pushed (push, TASK-171.11, is the last item on the roadmap and does not cover race invites).

Scope:
- **Race session**: any buddy-read participant starts a race with a goal: read N words (100 to 20,000), reach the end of the current chapter, or read for N minutes (1 to 60). Other participants get an in-app invite and can join a lobby that stays open for 2 minutes; the starter can start early once another racer has joined, or cancel. If the lobby closes with fewer than two racers, the race is cancelled and the starter sees "nobody joined". The race starts on a shared 5-second countdown.
- **Invite states**: an invite shows as open while the lobby is open and as expired afterwards; tapping an expired invite explains that the race has started or ended. Joining opens the buddy-read book in the reader with the lobby overlay. Declining is silent.
- **Live progress**: during the race, each racer's progress updates in near real time (target ≤ 2 s latency) over a realtime channel on `apps/web`. Only joined racers receive and broadcast live progress; members who did not join keep the normal TASK-171.8 view. Normal sync push (`scheduleSyncPush`) stays the source of truth for the persisted position. Race updates are ephemeral and not stored beyond the result.
- **Fairness**: each racer starts from their own current position. The score is words read during the race, computed server-side from reported positions and capped by the shared plausibility rule, so skipping ahead does not win. Ranking: a time goal ranks by words read. Word and chapter goals rank by finish time, with non-finishers below, ordered by words read. Ties share a rank.
- **Duration cap**: word and chapter races end at most 60 minutes after the start; racers who have not finished count as not finished.
- **UI**: a race overlay in the reader in all three modes (RSVP, scroll, page) shows the countdown, the viewer's rank, each racer's words read (and progress toward the goal for word and chapter goals), and the gap in words to the racer ahead. It never shows other racers' book position or chapter. "Leave race" is always available. The results screen shows rank, words read, average WPM and DNF status per racer, and the result is posted to the buddy-read discussion.
- **Leaving and disconnects**: a racer who leaves is DNF immediately. A racer whose connection drops is DNF after 60 seconds without a report or stream; one who reconnects within that time continues with their score intact. The race ends at the goal, at the duration cap, or when everyone has finished or is DNF. If one racer remains active, the race continues for them.
- **Offline and errors**: "Start race" is disabled offline and when the buddy read has no other active members, with a reason shown. If the stream cannot be opened or ends without a result, the overlay shows "race aborted" and the reader keeps working normally.
- **Spoilers**: the chapter goal uses each racer's own current chapter. No text, chapter titles or book positions are shared beyond what TASK-171.8 already shows participants.
- **Blocks**: the TASK-171.8 rule applies: two participants with a block between them do not see each other in the lobby, overlay, results screen or result post. Both can still race.
- **Abuse limits**: race starts are rate-limited so members cannot be flooded with invites: at most one start per buddy read every 5 minutes, and 10 per user per hour.
- **Scaling**: races are small (at most the buddy-read cap). A single-node in-memory channel is acceptable at first, documented as such.

Out of scope: spectators, races outside buddy reads, persisted race history or cross-race leaderboards, multi-instance fan-out (Redis/pub-sub), a global opt-out from race invites, push notifications for race invites.

Implementation notes (verified against the code):
- **Transport.** `apps/web` runs Nitro's `node-server` preset as one container (`apps/web/vite.config.ts`, `apps/web/Dockerfile`), so in-process race state works; nothing uses WebSockets or SSE yet. Use Server-Sent Events from a file route under `apps/web/src/routes/api/` returning a streaming `Response` (Nitro WebSockets need experimental config), plus a POST endpoint for start, join, leave, cancel and position reports. Both use `middleware: [cors, requireAuth]` like `api/sync.ts`. Send heartbeat comments every ~15 s and `Cache-Control: no-cache` / `X-Accel-Buffering: no` so a proxy does not buffer the stream.
- **Native auth.** `EventSource` cannot set an `Authorization` header, so read the stream with `fetch` + `ReadableStream` through the shared authed-fetch helper extracted from `syncFetch` (`apps/capacitor/src/services/sync/index.ts`; see TASK-171), which also covers the web build's cookie path. This works because `CapacitorHttp` is not enabled in `apps/capacitor/capacitor.config.json`; enabling it would break streaming. The CORS preflight in `apps/web/src/lib/cors-middleware.ts` already allows `Authorization`, and native origins are in `apps/web/src/lib/allowed-origins.ts`.
- **Countdown clock.** Send the start as an absolute server timestamp with the server's current time, so each client corrects for its own clock offset.
- **Position reports.** Racers report their word position from the reader (`apps/capacitor/src/pages/reader/index.tsx` owns it) at most about once per second. Rate-limit with `checkLimit` (`apps/web/src/lib/rate-limit.ts`) keyed `race-pos:${userId}`, and starts with `race-start:${userId}` and `race-start:${buddyReadId}`. The server validates that the reporter is a joined racer and current buddy-read member and that the position is within `sync_books.word_count` of their linked copy. It fans out words read and goal progress, not raw positions.
- **Plausibility.** Thresholds live only in the app: `MAX_PLAUSIBLE_WPM = 1500` / `isPlausibleRate` in `apps/capacitor/src/services/stats/aggregate.ts`, and the credit throttle in `apps/capacitor/src/pages/reader/session-tracker.ts` (`SANE_WPM_CEILING = 800` for scroll/page, RSVP dial × `RSVP_DIAL_HEADROOM`, token bucket with `CREDIT_BURST_WORDS = 500`). `apps/web` cannot import from `apps/capacitor`, so move the ceiling and token-bucket crediting into `packages/core` and use the same function in the tracker and in race scoring. Decision: each report carries the reader mode and, in RSVP, the dial WPM; the server applies the shared ceiling for that mode with the dial clamped to `MAX_PLAUSIBLE_WPM`, so a forged dial never exceeds the global cap. Backward jumps credit nothing. Average WPM is credited words divided by active race time.
- **Chapter goal.** Compute each racer's target from the `chapters` JSON (`[{title, startWord}]`) and `word_count` of their own `sync_books` row: the next chapter's `startWord`, or the end of the book in the last chapter. A book without chapters counts as one chapter. Different `word_count` values between copies (tokenizer skew, TASK-171.8) do not block a race, since each racer is scored against their own copy.
- **Lifecycle.** iOS and Android suspend the WebView when the app is backgrounded or the screen locks, which drops the stream; treat that as a disconnect subject to the DNF timeout. A racer who deletes the buddy-read book, leaves the buddy read or is removed mid-race becomes DNF. A server restart loses in-memory races: clients show "race aborted" and no result is posted. Races are keyed by buddy-read id; allow at most one active race or open lobby per buddy read and refuse a second start with a clear error.
- **Result post.** TASK-171.9 comments are user-authored and anchored; a race result needs a discussion item kind that is unanchored and always visible to members. Store the goal plus one row per racer with user id, rank, words read, average WPM and finished/DNF, never copied handles, chapter titles or positions. Render handles at read time through the TASK-171.2 visibility helper so blocks and handle changes apply. Add it to the TASK-171.9 schema with a migration in `apps/web/drizzle/`, and add a "race invite" type to the TASK-171.4 inbox. Result posts are system-generated and not a report target.
- **Sync interaction.** `scheduleSyncPush` and reading-session recording in `session-tracker.ts` are unchanged, so a race sitting appears in stats as a normal session.
- **Account deletion.** Only the result post persists. Deleting an account removes that user's racer rows (an `onDelete: "cascade"` FK to `user` covers all three deletion paths) and deletes a result post with no racers left; other racers' rows stay. Extend `account-deletion.integration.test.ts`. A deleted user in a running race ends as DNF.
- **Rollout.** Older builds have no Social tab; invites to them expire. Clients ignore unknown stream event types.
- **Docs.** Add "race" to `CONTEXT.md`. In `apps/web/src/routes/privacy/index.tsx`, state that during a race your words read and speed are sent live only to the other joined racers, held in server memory only for the race, and that the result is kept in the buddy-read discussion until the buddy read or your account is deleted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A buddy-read participant can start a race with a word goal (100 to 20,000), a chapter goal or a time goal (1 to 60 minutes); out-of-range goals are rejected
- [ ] #2 Other participants receive an in-app invite that shows as expired once the 2-minute lobby closes, and tapping an expired invite explains that the race has started or ended
- [ ] #3 A lobby that closes with fewer than two joined racers cancels the race and tells the starter nobody joined; the starter can cancel the lobby or start early once another racer has joined
- [ ] #4 Joined racers see a shared countdown that starts at the same moment regardless of device clock offset
- [ ] #5 During a race, each racer sees the other racers' words read, rank and gap update within about 2 seconds in RSVP, scroll and page modes
- [ ] #6 The race overlay, stream and results never expose another racer's book position, chapter or chapter title, and members who did not join receive no live race data
- [ ] #7 Race streaming and position reports work on native (bearer) and on the web build (cookie)
- [ ] #8 Position reports from users who are not joined racers or not current buddy-read members, or with positions beyond their copy's word count, are rejected
- [ ] #9 Scores are computed server-side as words read during the race, using the same plausibility rule as the reading-session tracker, shared from packages/core
- [ ] #10 A forward jump beyond the plausibility rule, a backward jump, or an RSVP dial value above MAX_PLAUSIBLE_WPM does not increase a racer's score beyond the cap
- [ ] #11 The chapter goal ends at the start of the racer's next chapter, at the end of the book in the last chapter, or at the end of the book when it has no chapters
- [ ] #12 Time races rank by words read; word and chapter races rank by finish time with non-finishers below ordered by words read; ties share a rank
- [ ] #13 A racer who leaves is DNF immediately; one who disconnects is DNF after 60 seconds; one who reconnects within 60 seconds continues with their score intact
- [ ] #14 A racer who deletes the book, leaves the buddy read or is removed during a race becomes DNF
- [ ] #15 The race ends at the goal, at the 60-minute cap for word and chapter goals, or when everyone has finished or is DNF
- [ ] #16 Only one race or open lobby can exist per buddy read, and a second start is refused with a clear error
- [ ] #17 Race starts are rate-limited to one per buddy read every 5 minutes and 10 per user per hour
- [ ] #18 Start race is disabled with a reason when offline or when no other member is active, and a stream that fails or ends without a result shows race aborted while the reader keeps working
- [ ] #19 A results screen shows rank, words read, average WPM and DNF status per racer, and the result is posted to the buddy-read discussion as an unanchored item that stores user ids, not handles, and contains no chapter titles or positions
- [ ] #20 Participants with a block between them do not see each other in the lobby, overlay, results screen or result post
- [ ] #21 Race position updates are not persisted beyond the result, and normal position sync and reading-session recording are unaffected
- [ ] #22 Account deletion through all three paths removes the user's racer rows from result posts and deletes posts with no racers left, while other racers' rows remain, verified in account-deletion.integration.test.ts
- [ ] #23 Tests cover scoring, the plausibility cap, ranking per goal type including ties, lobby cancellation, DNF and reconnect handling, race end conditions and position-report validation
- [ ] #24 CONTEXT.md defines race, and the privacy policy states who receives live race progress, that it is held only in memory for the race, and how long race results are kept
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan

Order: 171.12 before 171.11. Push (171.11) is the last roadmap item by decision, and it needs a Firebase project, `google-services.json` and a service-account credential that only the owner can provide.

### 1. Core (`packages/core`)
- **Race crediting** (`race.ts`, next to `reading-rates.ts`):
  - Move the session tracker's `SANE_WPM_CEILING`, `RSVP_DIAL_HEADROOM`, `CREDIT_BURST_WORDS` and the per-tick crediting (the token bucket: refill by ceiling × elapsed time, cap at the burst; forward-only movement; partial credit; the dial clamped to `MAX_PLAUSIBLE_WPM`) into a pure `creditStep(state, { pos, mode, dialWpm, elapsedMs })`.
  - `session-tracker.ts` calls it, so its behaviour stays the same: its existing tests must stay green.
  - The tracker's per-mode jump thresholds stay in the tracker. The race treats any movement over the bucket as uncredited, which is stricter.
- **Types and constants:**
  - `RaceGoal = { kind: "words"; words } | { kind: "chapter" } | { kind: "minutes"; minutes }` with Zod bounds (100–20,000 words, 1–60 minutes).
  - `RaceSnapshot`: phase (lobby, countdown, running, finished, aborted), goal, `startsAt`, `serverNow`, and racers `{ identity, isSelf, joined, wordsRead, goalProgress (0–1 or null), finishedAt, dnf, rank, gapAhead }`.
  - `RaceResult` and the constants: 2-minute lobby, 5-second countdown, 60-minute cap, 60-second DNF timeout, 1-second report interval.
  - Notification type `race_invite`; discussion item kind `race_result`.

### 2. Server (`apps/web`)
- **`lib/social/race.ts`**, an in-memory registry keyed by buddy-read id, single node, documented as such. It is a class with an injectable clock so it can be unit-tested:
  - **Start:** the starter must be an active member with at least one other active member. Validate the goal, rate-limit per read and per user, and allow one race or lobby per read. Record `race_invite` inbox items for the other visible members.
  - **Join, leave, cancel, start early.** When the lobby closes with fewer than two racers, the race is cancelled. Otherwise a 5-second countdown follows, sent as absolute `startsAt` plus `serverNow`.
  - **Report `{ pos, mode, dialWpm }`:** the reporter must be a joined racer and a current member, and the position within their copy's `word_count`. Credit it with core `creditStep`, check the goal (words; chapter target from their own `chapters` JSON computed at start; minutes), and set `finishedAt`.
  - **DNF:** after 60 seconds without a report or stream, or when leaving. Membership is re-checked on report and on a 5-second sweep, so a racer who left the read, was removed or lost the book becomes DNF. Reconnecting within 60 seconds keeps the score.
  - **End:** at the goal (all finished), the 60-minute cap (word and chapter goals), the time limit (minutes goal), or when everyone has finished or is DNF.
  - **Ranking:** a minutes goal ranks by words read. Word and chapter goals rank by finish time, with non-finishers below by words read. Ties share a rank.
  - **Result:** written as a `buddy_read_comment` row of kind `race_result` plus `buddy_read_race_racer` rows (user id, rank, words, average WPM, dnf). Migration 0030 adds the racer table (cascade on the comment and on the user), and `anchor_kind` allows `none` for unanchored items.
- **Discussion:** `getDiscussion` returns race results as always-visible items, not reportable. Racer handles are resolved at read time with the visibility helper, so blocked people are left out.
- **Account deletion:** removes that user's racer rows and deletes result posts with no racers left.
- **Routes:**
  - `POST /api/social/race` with `{ action: start | join | leave | cancel | begin | report, … }`.
  - `GET /api/social/race-stream?buddyReadId=`: SSE with the `snapshot` event on every change, a 15-second heartbeat, and headers `no-cache` and `X-Accel-Buffering: no`.
  - Snapshots are built per viewer: blocked racers hidden, never positions or chapters, and only joined racers get live data (others get lobby and state only).
- **Inbox:** the `race_invite` item carries the buddy-read subject and the race state (open or expired).
- **Tests:**
  - Unit (registry with a fake clock): scoring cap, backward and forward jumps, a forged dial, chapter targets, ranking with ties per goal, lobby cancellation, starting early, the countdown, DNF, reconnect, end conditions, report validation.
  - Integration: the result post, block filtering, account deletion.

### 3. App (`apps/capacitor`)
- **`services/social/race.ts`:** the POST client, and an SSE reader over `authedFetch` + `ReadableStream`, so bearer and cookie auth both work. `useRaceStream(buddyReadId)` reconnects with backoff and computes the clock offset from `serverNow`.
- **Buddy-read page:** a **Start race** button that opens a goal sheet. It is disabled offline or when alone, with the reason shown.
- **Inbox `race_invite`:** "Join race" opens the reader of the linked book with the lobby. An expired invite explains that the race has started or ended.
- **Reader** (`pages/reader/index.tsx`, all modes):
  - A `RaceOverlay`: lobby (who joined, start early and cancel for the starter), countdown, and then your rank, words read and goal progress for each racer, the gap to the racer ahead, and Leave.
  - It reports the position about once a second while running, with the mode and RSVP dial.
  - "Race aborted" when the stream fails.
  - A results sheet at the end: rank, words read, average WPM, DNF.
  - Normal sync and session tracking are unchanged.
- **Discussion:** a `race_result` card (goal, ranked racers).

### 4. Docs
- CONTEXT.md "Race".
- A privacy-policy paragraph: live progress goes only to joined racers, is held in memory, and the result is kept until the buddy read or the account is deleted.
- `docs/social-races.md`, noting the single-node limitation.

### Verification
- Unit and integration tests; web, core and app suites.
- Device test with Phone One on the phone and Phone Two scripted through the API (join, report positions, leave) to watch live updates.
- A 4-agent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cross-task contracts (from the final review of the TASK-171 set):
- **Invites**: race invites are inbox-only; TASK-171.11 does not push unmapped types. The race-invite type is added through TASK-171.4's `createNotification` and uses its generic expired state for the 2-minute lobby.
- **Plausibility in core**: by the time this task starts, TASK-171.5 has already moved `isPlausibleRate` and `MAX_PLAUSIBLE_WPM` into `@lesefluss/core`. This task moves only the session-tracker ceiling and token-bucket crediting next to them and imports the rest, so there is one shared source.
- **Result post**: TASK-171.9 already reserves a `kind` column on discussion items, so this task adds the `race_result` kind (unanchored, always visible, exempt from spoiler gating and reporting) instead of a new table. Race tables reference the buddy read with `onDelete: "cascade"`, as TASK-171.8 requires.
- **Visibility** among racers uses TASK-171.2's block-and-ban helper (not friendship), as in TASK-171.8. Client calls use TASK-171.1's authed-fetch helper.

## Progress (2026-09-27)
Implemented:
- Core: `reading-credit.ts` (`creditCeilingWpm`, `refillCredit`, `spendCredit`, ceiling constants); the session tracker uses it and its 39 tests are unchanged. `race.ts` holds goals, action and report schemas, snapshots, results, constants and copy; `race_invite` notification type; `DiscussionPage.races`.
- Server:
  - `race-engine.ts`: pure rules for lobby, countdown, crediting, finish, DNF, end and ranking.
  - `race-registry.ts`: the process-wide engine and the invite state.
  - `race.ts`: membership and book checks, invites, per-viewer snapshots, result posts, the 1-second ticker, the 5-second membership sweep, the SSE stream.
  - Routes `POST /api/social/race` and `GET /api/social/race-stream`.
  - Migration 0030 (`buddy_read_race_racer`); `anchor_kind` `none` for system items.
  - Race results in `getDiscussion`, cleanup in `purgeDiscussionOf`, the `race_invite` inbox subject; `chapterStarts` shared.
- App: `services/social/race.ts` (client, fetch-based SSE reader with backoff and clock offset), a Race button and goal sheet on the buddy-read page, Join race in the inbox, `pages/reader/race-overlay.tsx` (lobby, countdown, live board, leave, results sheet, aborted state, position reports), and a race result card in the discussion.
- Docs: CONTEXT.md Race, `docs/social-races.md`, a privacy paragraph.
- Tests: engine unit tests (12), service integration tests (2), a race cleanup check in account-deletion, an SSE parser test. Web 202, core 130, app 673; typechecks clean.

The device test is pending (the phone was locked).

## Device test (2026-09-28)
Phone One on the phone, Phone Two scripted through `POST /api/social/race`.
- **Race 1** (500 words), started from the buddy-read Race sheet:
  - The reader opened with the lobby. Phone Two joined and appeared live.
  - Start now ran the 5-second countdown, and the live board updated each second (words read, rank, gap, progress bars).
  - Leave race marked Phone One out. Phone Two raced on alone and finished (504 words, 399 wpm).
  - The results sheet showed rank, words, WPM and DNF. The Discussion tab showed the result card under Races.
- A second start within 5 minutes was refused as rate_limited.
- **Race 2** (1 minute), started by Phone Two:
  - Its lobby closed unjoined, and the inbox item then read "It has already started or ended".
  - A new start showed "Join race" in the inbox. Joining opened the reader in the lobby.
  - The time race ranked by words, without progress bars, and ended at the limit with results.
- The Race button on a buddy read with nobody else in it is disabled and shows its reason.
- Fix from the test: the live board showed a racer who was out with a rank and "N words behind". It now shows "–" and hides the gap once you are out or finished.

## Review (4 agents, 2026-09-28)
Accepted and fixed:
- A block made after joining did not hide the two racers from each other on the live board or in the results sheet, because visibility was computed only at start and join. The 5-second sweep now also rebuilds visibility for open and running races (`race.ts` `sweepMembership`).
- A stream that stayed down left a stale "Reconnecting…" board forever. After `RACE_DISCONNECT_MS` without a connection (the server has counted the racer out by then), the overlay shows "Race aborted".
- The reader unmounted the overlay while offline, so a results sheet the racer had already closed came back after a network blip. The overlay now stays mounted; the stream hook retries on its own and shows "Reconnecting…".
- A chapter or word target of 0 (a racer starting at the end of the book) gave `progress: null`. It now reports 1.
- New engine test: in a word race, finishers rank first and the others follow by words read (finished, then an active racer, then a DNF racer).

Not accepted:
- "Goals are presets only, not the full 100–20,000 range". The range is the server's validation bound, and presets were the planned design.
- "No abort message when the stream never opens". The overlay is mounted for every buddy-read book, so without a snapshot there is no known race to abort, and the reader keeps working.

Tests: web 203 (with the database), core 130, app 673. Typechecks clean. APK rebuilt.

## Superseded (2026-09-28)
After the device demo, the owner dropped the race format. TASK-171.15 replaces it with an always-on live board and removes all race code, tables and UI. None of this was ever committed or deployed. The shared credit bucket in `packages/core` (`reading-credit.ts`) stays.

## Archived (2026-09-28): superseded, not delivered
This task is archived rather than left Done. Its race format was built and device-tested, then dropped by the owner and removed completely in TASK-171.15, which replaced it with an always-on live board. None of the race code, tables or UI shipped: it was never committed and never deployed. The acceptance criteria and final summary above describe code that no longer exists. The only surviving piece is `packages/core/src/reading-credit.ts` (the shared credit bucket), which TASK-171.15 and the session tracker use.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Live reading races in a buddy read.

**Core**
- `reading-credit.ts` holds the reading tracker's credit ceiling and token bucket, now shared by the session tracker and race scoring.
- `race.ts` holds goals, action schemas, snapshots, results, constants and copy.

**Server**
- An in-memory race engine, single node, documented in `docs/social-races.md`:
  - A 2-minute lobby, start early, cancel, and "nobody joined".
  - A 5-second countdown sent as an absolute server time.
  - Scoring from positions checked on the server with the shared plausibility cap.
  - Chapter targets from each racer's own copy.
  - Ranking per goal type with shared ties.
  - DNF on leaving, after 60 s disconnected, or on losing membership; the end conditions and the 60-minute cap.
- `POST /api/social/race` and an SSE stream (`/api/social/race-stream`).
  - Snapshots are built per viewer: only joined racers get live data, blocks are applied, and no positions or chapters are sent.
  - Starts are rate-limited.
- A `race_invite` inbox type (open or expired).
- Results are stored as unanchored `race_result` discussion items plus `buddy_read_race_racer` rows (migration 0030). They are exempt from spoiler gating and reporting, and are cleaned up on account deletion.

**App**
- A Race button and goal sheet on the buddy-read page, disabled offline or when alone, with the reason shown.
- Join race in the inbox.
- A reader overlay in every mode: lobby, countdown, live board, leave, a results sheet, and "reconnecting" and "aborted" states.
- Position reports about once a second, and a race card in the discussion.

**Docs**
CONTEXT.md, `docs/social-races.md`, and the privacy policy.

**Verification**
- Tests: engine unit tests (13), integration tests (race flow, blocks, account deletion), and an SSE parser test.
- Device test on the phone with a second user driven through the API: lobby, join from the inbox, countdown, the live board, leaving, finishing, a time race, results, the discussion card, and the rate limit. RSVP and page modes, the web build (cookie sign-in) and reconnecting were not tried on the device.
- A 4-agent review; accepted findings are fixed.
<!-- SECTION:FINAL_SUMMARY:END -->
