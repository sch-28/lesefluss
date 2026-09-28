---
id: TASK-171.15
title: 'Live board in buddy reads: always-on live progress replaces reading races'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-28 10:49'
updated_date: '2026-09-28 14:50'
labels:
  - social
  - app
  - web
dependencies:
  - TASK-171.8
  - TASK-171.12
parent_task_id: TASK-171
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the TASK-171.12 device demo, the owner decided the race ceremony (lobby, invites, countdown, goals, results) is not wanted. The part worth keeping is the live progress. It should always be there, so buddy-read members can compare how they read without starting anything.

**Live board.** While you read a buddy-read book, the reader shows a slim strip: the members' avatars placed on one progress line by their position in the book. Tapping the strip expands the full board. For each visible member it shows:
- their position (% of the book) and how far ahead of or behind you they are;
- a "reading now" dot while they have the book open;
- their live reading speed (wpm) in the current sitting while they are reading now.

Whether the strip is collapsed or expanded is remembered. Members who are not reading now show their last synced position, which TASK-171.8 already shows participants.

**Opt-out.** A social setting, "Share live reading activity" (on by default), stops sending your live activity. You then see nothing live from others either. With it off, the strip still shows everyone's last synced positions.

**Replaces races.** All of TASK-171.12's race-specific parts are removed: the race engine, lobby, `race_invite` inbox type, result posts, race tables, overlay, start sheet and result card. None of it was ever committed or deployed, so migration 0030 is deleted rather than reversed. The dev and phone databases are cleaned by hand. The shared credit bucket in `packages/core` (`reading-credit.ts`) stays: the session tracker uses it, and live speed uses it too.

Rules carried over from TASK-171.8 and TASK-171.12:
- Only current members of the buddy read receive live data.
- Participants with a block between them do not see each other.
- Positions are never shared beyond what members already see.
- Live state lives only in server memory on a single node.
- Speed is computed server-side with the shared plausibility cap, so a forged dial or a jump cannot show an absurd speed.

Out of scope: live data outside buddy reads, history of live activity, push notifications, a "reading now" indicator outside the reader.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 While reading a buddy-read book, the reader's progress bar shows each visible member's position (dots on the always-on collapsed line, avatars when expanded); tapping a member shows position, ahead/behind in words, a reading-now indicator and live speed for members reading now
- [x] #2 A member who opens the book appears as reading now within about 3 seconds, their position and speed update within about 3 seconds while they read, and they stop showing as reading now within about 60 seconds after closing the book, backgrounding the app or losing the connection
- [x] #3 Live speed is computed on the server from reported positions with the shared plausibility rule from packages/core; a forward jump, a backward jump or an RSVP dial above MAX_PLAUSIBLE_WPM cannot push the shown speed above the cap
- [x] #4 Only current buddy-read members receive live data; reports from non-members or with positions beyond their copy's word count are rejected; participants with a block between them never see each other
- [x] #5 With "Share live reading activity" off, the user's reports are not accepted or shown, and the user receives no live data from others; last synced positions still show
- [x] #6 The reader keeps working normally when the live channel is offline or fails, and the markers fall back to last synced positions
- [x] #7 All race code, UI, API routes, the race_invite inbox type, result posts and race tables are removed; migration 0030 is removed, and the web, core and app suites and typechecks pass
- [x] #8 Tests cover live speed and its cap, reading-now timeout, member and block filtering, opt-out, and report validation
- [x] #9 CONTEXT.md replaces "race" with "live board", the privacy policy describes live reading activity (who sees it, that it is held only in memory, the opt-out), and docs/social-races.md is replaced by docs/social-live-board.md
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan

### 1. Remove races (TASK-171.12)
- **Core:** remove `race.ts` and its exports, the `race_invite` notification type and its inbox subject, `DiscussionPage.races`, and `SOCIAL_API.race` and `raceStream`. Keep `reading-credit.ts`.
- **Web:**
  - Remove `race-engine.ts` and its test, `race-registry.ts`, `race.ts`, the race integration test, the routes `race.ts` and `race-stream.ts`, and the `race_invite` handling in `inbox.ts`.
  - Remove `raceResultsFor` and the race purge in `buddy-read-discussion.ts`, the `race_running` and `alone` error codes, and the race case in the account-deletion test.
  - `anchor_kind` `none` and the `kind !== "comment"` guards go back to their pre-race state, where nothing else needs them.
- **Schema:** remove `buddyReadRaceRacer`. Delete `drizzle/0030_buddy_read_races.sql` and its journal entry. For the dev and phone databases, a manual SQL script drops the table, deletes `race_result` comments and `race_invite` notifications, and removes the migration row.
- **App:** remove the race start sheet, the result card and overlay, the Race button on the buddy-read page, Join race in the inbox, and the race service and its test. The SSE parser moves to the live service with its test.

### 2. Server: the live board
- **`lib/social/live-board.ts`:** a pure `LiveBoard` class with an injectable clock, one entry per buddy read and member:
  - It stores `position`, `wordCount`, `lastSeenAt` and a `sitting` (start, credited words, credit budget, last position).
  - `report(read, user, {position, mode, dialWpm}, now)`:
    - After more than 30 s of silence a new sitting starts. The first report only sets the start position.
    - Credit comes from `refillCredit`/`spendCredit` (core), so jumps and backward moves are not counted and a forged dial is capped.
    - Live speed is credited words divided by active sitting minutes. It is shown once the sitting is at least 20 s old.
  - `stop(read, user)`: reading-now ends at once, when the reader closes or the app goes to the background.
  - `tick(now)`: drops members silent for more than 30 s.
- **`lib/social/live.ts`:** the service.
  - Report checks: a current member with a live book, and the position within their copy's `word_count` (the `memberBook` pattern from the race); the opt-out is checked too.
  - A per-viewer snapshot: blocked members and anyone who has opted out are filtered with the TASK-171.2 visibility helper. A viewer who has opted out gets `live: false` and no members.
  - SSE fan-out, a 15-second heartbeat and a 1-second ticker, based on the race stream code.
- **Snapshot:** `{ live: boolean, members: [{ userId, readingNow, wordPosition, wordCount, wpm | null }] }`. It contains only what members already see (positions) plus the reading-now state and speed.
- **Routes:**
  - `POST /api/social/live` with `{ action: "report" | "stop", buddyReadId, position?, mode?, dialWpm? }`, via the TASK-173 factory. Rate limit: `live-report`, 90 per minute.
  - `GET /api/social/live-stream?buddyReadId=`: SSE.
- **Opt-out:**
  - A new `social_profile.share_live_reading boolean NOT NULL DEFAULT true`. The new migration takes number 0030, replacing the deleted race migration.
  - It is part of the profile read and update (`UpdateSocialProfileBodySchema`, `getOwnProfile`).
  - Turning it off ends the user's live entries at once.

### 3. App
- **`services/social/live.ts`:** `liveClient` (report and stop), and `useLiveBoard(buddyReadId)`, the fetch-based SSE reader moved from the race service, with reconnects.
- **`LiveBoardStrip`** in the reader (`pages/reader/live-board.tsx`), for buddy-read books in every mode:
  - It uses the TASK-171.8 buddy-read progress as the base, with live entries on top.
  - **Collapsed:** a slim line with member avatars at their positions and a green dot for reading now.
  - **Expanded:** one row per member with name, %, "N words ahead" or "N words behind", a reading-now dot and wpm.
  - The collapsed or expanded state is stored in local preferences.
  - It sends a report about every 2 s while the reader is open, in the foreground and online, and `stop` on unmount or when the app goes to the background.
  - It hides itself quietly when there are no other members.
- **Settings → Social:** a toggle, "Share live reading activity", with a short explanation.

### 4. Docs
- CONTEXT.md: "Live board" replaces "Race".
- `docs/social-live-board.md` replaces `docs/social-races.md` and states the single-node limit.
- The privacy policy paragraph becomes: live activity goes only to buddy-read members, it is held in memory only, and there is an opt-out.
- TASK-171.12 gets a note that TASK-171.15 superseded it.

### Verification
- Unit tests for `LiveBoard`: the speed cap for jumps, backward moves and a forged dial; a new sitting after silence; the reading-now timeout; `stop`.
- Integration tests: member and block filtering, opt-out (report ignored, viewer gets `live: false`), report validation (not a member, beyond the word count), and account deletion leaving nothing behind.
- The SSE parser test, moved.
- Web (with the database), core and app suites and typechecks.
- Device test: Phone One on the phone, Phone Two scripted through the API (reports, stop, timeout, opt-out).
- A 4-agent review if you ask.

## Plan update (2026-09-28): the live board moves into the reader's progress bar
The owner decided against a second, full-width bar. The main progress bar already has the buddy markers from TASK-171.8, so live progress goes there:
- **Collapsed state, always on in every mode:** a thin line at the bottom edge with your progress fill and small buddy dots, green while reading now. It no longer disappears when scrolling.
- **Expanded, on tap as today:** the scrubber and labels, buddy avatars moving live, a green ring while reading now, and an "N reading" chip next to your %.
- **Tapping a buddy marker:** the popover shows "name · reading now · N wpm · N words ahead or behind", or their last synced position.
- **Scroll, or tapping the text:** collapses back to the thin line. RSVP keeps the expanded bar.
- **Removed:** the top `LiveBoard` strip and its localStorage preference.
- **Unchanged:** reporting, the stream, opt-out and the server.
- **AC #1 reworded:** the live board lives in the progress bar.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation (2026-09-28)
- **Races removed.**
  - Core: `race.ts`, `race_invite`, `DiscussionPage.races`, the race API paths.
  - Web: the engine, registry, service, routes and tests; migration 0030; `buddyReadRaceRacer`. The race-only edits to errors, inbox, discussion, discussion-gate and moderation targets were reverted to HEAD.
  - App: the overlay, start sheet, result card, Race button, inbox Join race and race service.
  - The race case in the account-deletion test.
  - Dev and phone databases: the race table was dropped, `race_result` comments and `race_invite` notifications deleted, and the old migration row removed.
- **Core:**
  - `live-board.ts`: `LiveActionBodySchema`, `LiveSnapshot` and `LiveMember`, and the constants (2 s report, 30 s idle, 20 s minimum sitting).
  - `OwnSocialProfile.shareLiveReading`, and `SOCIAL_API.live` and `liveStream`.
  - `BuddyReadProgress` participants gained `avatarUrl`.
- **Web:**
  - `live-board.ts`: the pure `LiveBoard`. Sittings with credit from core `refillCredit`/`spendCredit`, refill capped at 10 s per report, wpm after 20 s, idle drop, `stop` and `stopEverywhere`.
  - `live.ts`: the membership and copy check, the report bound (word count), a dropped report when opted out, per-viewer snapshots with the visibility helper, SSE with a 15 s heartbeat, a 1 s tick and a 5 s sweep. The sweep re-checks membership, opt-out, blocks and viewer settings.
  - Routes `POST /api/social/live` (on the TASK-173 factory, `live-report` 90 per minute) and `GET /api/social/live-stream` (`live-stream` 30 per minute).
  - Migration 0030 `share_live_reading`. `updateOwnProfile` takes the user off every board when they opt out.
- **App:**
  - `services/social/live.ts`: the client, and `useLiveBoard` (the fetch SSE reader moved from the race service, with its test).
  - `pages/reader/live-board.tsx`: a strip under the header (avatars on the progress line, a green ring for reading now, your own dot, an "N reading" count) that expands to rows with %, ahead or behind, "reading now · N wpm". The expanded state is kept in localStorage.
  - It reports every 2 s while in the foreground, online and opted in, and sends `stop` on unmount or when the app goes to the background.
  - Settings → Social: "Share live reading activity".
- **Docs:** CONTEXT.md "Live board", `docs/social-live-board.md` in place of `social-races.md`, and the privacy paragraph.

## Verification
- Web 204 with the database, including `live-board.test.ts` (5) and `live.integration.test.ts` (4). Core 130. App 673, including the moved SSE parser test. Typechecks and Biome are clean.
- **Device test.** Phone One ran on the phone; Phone Two was scripted to report 10 words every 2 s.
  - The strip showed Phone Two's avatar ringed as reading now, with "1 reading". Expanded: "reading now · 295 wpm", 27%, 446 words behind, updating live.
  - Phone Two's stream showed Phone One. Sending the phone app to the background removed Phone One at once, and bringing it back restored it.
  - When Phone Two went silent without `stop`, it dropped off after about 30 s, and the strip fell back to the last synced position (92%).
  - Not tried on the device: the opt-out toggle and a block. Both are covered by the integration tests.

## Live board moved into the progress bar (2026-09-28)
- **Removed:** the top strip. `pages/reader/live-board.tsx` is now only `useLiveReading`: reporting every 2 s, `stop` on unmount or background, and the stream, returning a map of who is reading now.
- **Markers:** `useBuddyReadMarkers(buddyReadId, ownWordCount, live)` overlays live positions on the synced ones and adds `avatarUrl`, `wordPosition` and `live`. Live data applies only to in-progress buddy reads.
- **`BuddyReadMarkers`:**
  - Collapsed: small dots, green while reading now.
  - Expanded: an avatar, or the initial, with a green ring while reading now.
  - The popover shows "name @handle · %" plus "reading now · N wpm · N words ahead or behind".
  - The expanded label adds "· ● N reading".
- **Progress bar:**
  - Always rendered. Collapsed (scroll and page mode unless tapped) it is a 3 px line over an opaque background, with no pointer events.
  - RSVP keeps it expanded.
  - The own position is read from the restored ref (`getRestoredPosition`), so nothing is drawn or reported before the restore.
- **Fixed on the device:**
  - Scrolling flashed the line to 0. The first tick after a hide still saw the bar as visible and wrote a paragraph-start word, which is 0 in a one-paragraph book. Ticks coarser than the current word no longer write the bar.
  - While collapsed, the line now follows scrolling in 0.5% steps. The settle still writes the exact word.
- **Verified on the phone:**
  - Collapsed: the line and Phone Two's green dot; no flash to 0 before, during or after a scroll; an opaque background below.
  - Expanded: "82% · 4 min left · ● 1 reading" and the ringed marker.
  - The popover: "Phone Two @phonetwo · 48% / reading now · 295 wpm · 570 words ahead".
  - A mis-tap on the track scrubs, as before (it snaps to the paragraph start, 0 in this test book).

## Related fix: double shift after a scrub (older than this task, 2026-09-28)
- **Measured on the device** (Golden Son, CDP scroll log after a scrub tap): the jump, then +87 px at about 34 ms (VList correcting estimated paragraph heights after `scrollToIndex`), then +5 px at about 150 ms (the fine word align).
- **Second fault:** each `jumpTo` started a fine align without cancelling the previous one, so aligns from earlier in a drag could fire late.
- **Fix, in `ScrollView.jumpTo`:**
  - Non-smooth, non-fine jumps add `.reader-jump-landing` (opacity 0, no transition) to the list container. The class comes off once the fine align's `onReady` fires, or after two frames for the chapter-heading path.
  - The container's inline `transition: opacity 0.12s` then fades the text in.
  - A new jump cancels the previous align and reveal.
  - This covers scrubs as well as search, chapter and highlight jumps in scroll mode.
- **After the fix:** all movement (644642 → 644170) happened at opacity 0 within 150 ms. The reveal ran from 182 ms to about 300 ms with no further movement.

## Scrub landing: skeleton, bubble, and the bar staying open (2026-09-28)
- **Dimmed text dropped:** at 20% opacity the text still showed both shifts. While a jump lands, and for the whole of a progress-bar drag, the text is now hidden behind the reader skeleton (`.reader-jump-landing` on the wrapper; `.reader-scroll-content` at opacity 0; `.reader-jump-skeleton` shown). It fades in once the drag has ended and the fine align has run.
- **Drag bubble:** above the finger it shows the chapter title and %. `useScrubProgress` has an `isDragging` state.
- **The bar stays open after a scrub:** scrolls caused by the jump (`suppressNextScrollEndRef` still set, or not yet landed) no longer count as the user scrolling.
- **On the phone** (Golden Son, CDP log):
  - While the finger was held after a drag, the page showed the skeleton and the bubble ("32: Die Young, 63%").
  - After release, the scroll position stayed fixed at 83590 while the opacity went from 0 to 1 over about 150 ms.
  - The bar stayed expanded after drags and after a tap.

## Review (5 agents, 2026-09-28)
Accepted and fixed:
- **Page mode:** pagination used the full height, so the always-on progress line covered the bottom of every page. `.page-view` height is now `calc(100% - 3px - var(--safe-bottom))`, and pages re-flow through the existing resize re-anchor.
- **Progress-bar gestures:** there was no `pointercancel` handler. A drag the system cancelled (a call, an edge swipe) left `isDragging` set, so after the next jump the text stayed hidden for good. Added `handleProgressPointerCancel`.
- **Taps during a jump:** hidden text could still be tapped while a jump landed. `.reader-jump-landing > .reader-scroll-content` now has `pointer-events: none`.
- **Jumps that do not scroll:** a jump to where the view already is fires no scroll end, so `suppressNextScrollEndRef` stayed set. The next real scroll's position was then not saved (this predates the task), and with this task's change the bar would not hide either. After landing, if the jump caused no scroll event within two frames, both suppress flags are cleared.
- **Reports arriving out of order:** a slow report could land after a newer one and move a member backwards for about 2 s. The app now keeps only one report in flight.
- **Docs:** CONTEXT.md and `docs/social-live-board.md` still described the removed top strip. Both now describe the progress-bar markers.

Also confirmed by the review:
- Race removal is complete, and the reverted files are clean.
- The app hooks, the server filtering, the SSE lifecycle, the sweep and the privacy paragraph are correct.
- The progress-bar changes do not touch saved-position writes (`lastWordRef`, `savePosition`, settle).

## Final verification
Web 204 with the database; core 130; app 673. Typechecks and Biome are clean. The full Playwright e2e suite passes, 72 of 72: the page-object `progressBar` selector now targets the expanded bar, because the collapsed line is always shown. The last APK build could not be installed because the phone had disconnected.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reading races are replaced by an always-on live board in buddy reads, shown on the reader's progress bar.

**Races removed**
All race code, UI, routes, the inbox type, result posts, tables and migration are gone, and the dev and phone databases are cleaned. The shared credit bucket stays in `packages/core`.

**Server**
- A pure `LiveBoard` in memory: sittings credited with the reading tracker's plausibility rule, live wpm, a 30 s idle drop and `stop`.
- `live.ts` checks membership and the copy's word count, builds per-viewer snapshots with block and visibility filtering, streams them over SSE, and sweeps every 5 s.
- `POST /api/social/live` and `GET /api/social/live-stream`.
- The opt-out is `social_profile.share_live_reading` (migration 0030).

**App**
- `useLiveReading` reports every 2 s, one report in flight at a time, while the app is in the foreground, online and opted in. It sends `stop` on close or background.
- Buddy markers on the progress bar: dots on an always-on 3 px resting line (green while reading), and avatars with a green ring when expanded. The popover shows %, reading now, wpm and words ahead or behind, and the label shows "N reading".
- A Settings → Social toggle.

**Reader fixes found along the way**
- The collapsed and expanded bar now show the same position.
- No flash to 0 when scrolling.
- The page-mode height is reduced so the line never covers text.
- Scrubs and jumps land hidden behind the skeleton, with a chapter and % bubble while dragging. The text fades in without a second shift, and the bar stays open after a scrub.
- `pointercancel` is handled, hidden text cannot be tapped, and a jump that does not scroll no longer swallows the next scroll's position save.

**Docs**
CONTEXT.md "Live board", `docs/social-live-board.md`, and the privacy policy.

**Verification**
- Web 204 with the database, core 130, app 673, and Playwright e2e 72 of 72.
- Device tests on the phone for live updates, backgrounding, the idle timeout, the popover, bar consistency and scrub landing (with CDP scroll and opacity logs).
- A 5-agent review; the accepted findings are fixed.
<!-- SECTION:FINAL_SUMMARY:END -->
