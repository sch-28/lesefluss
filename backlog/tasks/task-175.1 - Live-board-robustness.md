---
id: TASK-175.1
title: Live board robustness
status: Done
assignee:
  - '@claude'
created_date: '2026-09-28 16:18'
updated_date: '2026-09-28 17:58'
labels:
  - social
  - web
  - app
dependencies:
  - TASK-171.15
parent_task_id: TASK-175
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fixes to the TASK-171.15 live board found in the branch review. Server: `apps/web/src/lib/social/live.ts` and `live-board.ts`. App: `apps/capacitor/src/services/social/live.ts` and `pages/reader/live-board.tsx`.

- **B1.** In `sweep()`, `memberView(...).then(ok, () => false)` only catches a rejection from `memberView`. A rejection from `sharesLive` escapes the loop, aborts the round and becomes an unhandled rejection from `void sweep()`.
- **B2.** The sweep treats every error, a transient database error included, as "not a member". It stops the reader (their sitting and speed reset) and blanks the viewer's stream to `isLive: false`.
- **B3.** `useLiveBoard` retries forever with backoff capped at 8 s, even on permanent 4xx answers (not a member, a bad id). The report loop keeps posting every 2 s after failures. Each attempt costs about 5 or 6 queries.
- **B5.** `stop` is a separate fetch with no ordering against reports. A quick background and foreground can make the old `stop` land after the new report, so the user vanishes for about 2 s and their sitting restarts.
- **B7.** A listener who is no longer a member keeps an open stream that sends only heartbeats and empty snapshots until the client disconnects.
- **B9.** The server accepts live reports and streams for buddy reads that are not in progress; only the client gates this.
- **W2.** On a web tab close no `stop` is sent (a plain fetch in cleanup does not survive unload), so friends see the user reading for up to 30 s (`LIVE_IDLE_MS`).
- **W4.** The `live-report` limit is 90 per minute per user. At one report every 2 s plus stops, three or more tabs or devices on the same buddy read hit 429.
- **B4, known limit only:** the sweep runs about 6 serial queries per live member and per listener every 5 s. The `isSweeping` guard skips rounds under load, so blocks, opt-outs and removals can apply later than 5 s. Buddy reads are capped at 8, so this is documented rather than optimised, unless batching `memberView` per read turns out to be cheap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A sharesLive or memberView rejection inside the sweep is caught per member and per listener; the round continues and no unhandled rejection is raised (unit test with a failing dependency)
- [x] #2 A transient error during the sweep leaves the reader's live entry and the viewer's visibility unchanged; only a definite not-a-member or opted-out result stops or blanks (test)
- [x] #3 The client stops retrying the live stream and stops posting reports after a permanent 4xx (400, 403, 404); it keeps retrying with backoff on network errors, 429 and 5xx (unit test)
- [x] #4 A stop sent before a report cannot remove a reader who has reported since: the server ignores a stop older than the reader's last report, or the client orders them (test)
- [x] #5 A listener's stream is closed by the server once the sweep finds the listener is no longer a member (test)
- [x] #6 The server rejects live reports and stream opens for buddy reads that are not in progress with not_found (integration test)
- [x] #7 On the web build, closing or hiding the tab sends the stop with keepalive fetch or sendBeacon on pagehide, so the member leaves the board without waiting for the idle timeout
- [x] #8 Several tabs or devices of one user reading the same buddy read do not hit the live-report rate limit (limit keyed per user and buddy read, or raised with a documented bound)
- [x] #9 docs/social-live-board.md documents the sweep's cost per round and the single-node limit
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan

### Server (`apps/web/src/lib/social/live.ts`, `live-board.ts`, routes)
- **Injectable checks.** `export const liveChecks = { memberView, sharesLive }`, and every call site goes through `liveChecks`. Unit tests replace them with `vi.spyOn`. Importing `~/db` does not connect, so `live.test.ts` needs no database.
- **Sweep with three outcomes (#1, #2, #5).** A helper `classify(err)`:
  - `SocialError("not_found")` from `memberView` is **definite**: stop the reader; for a listener, close its stream.
  - `sharesLive` returning false is **opted out**: stop the reader; for a listener, `isLive = false`, and the stream stays open.
  - Any other error is **transient**: leave the reader and the listener untouched, and log it (`console.warn`).
  - Each member and each listener gets its own try/catch, so one failure never aborts the round, and `sweep` itself never rejects.
  - `sweep` is exported for tests.
- **Closing a stream (#5).** A `Listener` gains `close()`, which runs the existing `cleanup`: it clears the heartbeat, deletes the set entry and the empty map key, and calls `controller.close()`. The same path runs on client abort or cancel.
- **Buddy reads not in progress (#6).** `memberView` throws `not_found` when `read.status !== "in_progress"`, which covers reports, stops (see below), stream opens and the sweep. A read that finishes while someone is live makes the next sweep stop them and close their stream.
- **Stop ordering (#4), on the server.**
  - Reports and stops gain an optional client `sentAt` (epoch ms) in `LiveActionBodySchema`. It stays optional, so older builds keep working.
  - `LiveBoard` keeps the reader's latest report `sentAt`.
  - `stop(read, user, sentAt?)` is ignored when both are known and the stop's `sentAt` is earlier than the last report's. With no `sentAt`, the old behaviour applies.
  - The `live` route passes `sentAt` through.
  - The client clock is compared only with the same client's reports. A second device with a skewed clock can at worst delay its own stop until the 30 s idle drop.
- **Rate limit (#8).** Raise `live-report` from 90 to 300 per minute per user. At 30 reports per minute per open reader plus stops, that bounds a user at about 9 concurrent readers. Keying per buddy read would need a factory change for no real gain. Documented in the notes and in `docs/social-live-board.md`.
- **Docs (#9).** In `docs/social-live-board.md`: the sweep cost per round (per live member, one `memberView` (buddy read plus `loadState` plus `visibleTo`, about 5 queries) and one `sharesLive`; the same per listener), rounds skipped under load, the single-node note, the rate-limit bound, and the stop ordering.

### App (`apps/capacitor/src/services/social/live.ts`, `pages/reader/live-board.tsx`)
- **Permanent errors (#3).** An exported pure `isPermanentLiveError(err)` is true for an `AuthedFetchError` with status 400, 401, 403 or 404. `useLiveBoard` returns `{ snapshot, isUnavailable }`:
  - On a permanent error it stops reconnecting and sets `isUnavailable`.
  - Network errors, 429 and 5xx keep the backoff.
  - `isUnavailable` resets when `buddyReadId` or `enabled` changes.
- **The report loop in `useLiveReading`.** A report failing with a permanent error clears the interval and marks the reader unavailable. When the stream is unavailable, no reports are sent. Nothing is shown to the user; the markers fall back to synced positions.
- **`sentAt`.** `liveClient.report` and `liveClient.stop` send `sentAt: Date.now()`.
- **Stop on page close, web only (#7).** `useLiveReading` listens for `pagehide` and sends `stop` with `keepalive: true` through `authedFetch`, which is same-origin, so the cookie applies. The existing path stays: the effect cleanup sends `stop` when leaving the reader, backgrounding (`isForeground` false) or hiding the tab.

### Tests
- `apps/web/src/lib/social/live.test.ts` (unit, no database, mocked checks):
  - a `sharesLive` rejection keeps the round going and the reader stays;
  - a `memberView` rejection with a generic error is transient, so nothing changes;
  - `not_found` stops the reader;
  - opted out stops the reader and blanks the listener;
  - a `not_found` listener gets its stream closed (the reader sees `done`, and the listener set is empty);
  - the sweep never rejects.
- `live-board.test.ts`: a stop older than the last report is ignored; a newer stop, or one without `sentAt`, removes the reader.
- `live.integration.test.ts` (throwaway database):
  - reports and stream opens for a finished buddy read give `not_found`;
  - the opt-out test uses a real stream opened by the opted-out user and reads its first snapshot (`live: false`) instead of a faked `isLive`.
- `apps/capacitor/src/services/social/__tests__/live-errors.test.ts`: `isPermanentLiveError` for 400, 401, 403 and 404 against 429, 500 and a network `TypeError`.

### Verify
- Web: typecheck; unit tests; the full web suite on a throwaway database, including the live, live-board, buddy-reads and buddy-read-discussion files.
- Capacitor: `pnpm check-types` and the social service tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation (2026-09-28)
- **Server, `lib/social/live.ts`:**
  - The sweep is exported. Each live member and each listener gets its own try/catch, and an outer catch means `sweep` never rejects.
  - `isNotMember` (a `SocialError` `not_found`) is the only definite answer: it stops the reader, or closes the listener's stream through the new `Listener.close()`, which reuses the existing cleanup (heartbeat, set entry, map key, `controller.close()`).
  - `sharesLive` false stops the reader, or sets `isLive = false` and keeps the stream.
  - Every other error is logged with `console.warn` and changes nothing.
  - The checks go through `export const liveChecks`, so tests can replace them.
  - `memberView` throws `not_found` unless `buddy_read.status === "in_progress"`, which covers reports, stream opens and the sweep.
- **Stop ordering (#4), server-side as preferred:**
  - `LiveActionBodySchema` has an optional `sentAt` (backwards compatible).
  - `LiveBoard` keeps the reader's last report `sentAt` and ignores a stop whose `sentAt` is older.
  - A stop without `sentAt` keeps the old behaviour.
  - The route passes `body.sentAt` through.
- **Rate limit (#8), a raised bound:** `live-report` goes from 90 to 300 per minute per user. At 30 reports a minute per open reader plus stops, that allows about nine concurrent readers of one user. Keying per buddy read would need a factory change for no real gain. Documented in the route comment and in `docs/social-live-board.md`.
- **App:**
  - `isPermanentLiveError` (400, 401, 403, 404).
  - `useLiveBoard` returns `{ snapshot, isUnavailable }` and stops reconnecting on a permanent error; network errors, 429 and 5xx keep the backoff.
  - `useLiveReading` stops the report loop when the stream is unavailable or a report is rejected permanently. Nothing is shown to the user; the markers fall back to synced positions.
  - Reports and stops send `sentAt`.
  - On the web build, `pagehide` sends the stop with `keepalive: true` through `authedFetch`, which is same-origin, so the cookie applies. Native keeps its path: the effect cleanup on background or leaving the reader.
- **Docs:** `docs/social-live-board.md`: the sweep cost per round, skipped rounds, definite versus transient outcomes, stop ordering, the rate-limit bound, and the not-in-progress rule.

## Verification
- Web `npx tsc --noEmit` is clean.
- On a throwaway database, the targeted files (`live.test.ts`, `live-board.test.ts`, `live.integration.test.ts`, `buddy-reads.integration.test.ts`, `buddy-read-discussion.integration.test.ts`) passed 50 of 50. The full web suite passed 210 of 210 in 25 files.
- Core typecheck is clean, and 130 tests pass.
- Capacitor `pnpm check-types` is clean, and its suite passes 675 of 675, including `live-errors.test.ts` (2 tests).
- **Left unchecked: AC #7.** The pagehide keepalive stop is implemented (`pages/reader/live-board.tsx`) but not run in a browser; this project has no web-build e2e yet (TASK-175.5). Hiding the tab already sent a stop through `isForeground`. AC #7 stays open until a browser check.
- **AC #3 test coverage:** the unit test covers the classification (`isPermanentLiveError`). The hooks' stop-on-permanent behaviour is plain code with no hook-level test (the project has no React hook test setup for these).

## Known edges, from the group A review (2026-09-28)
- **Rejection latch:** `isRejected` in `pages/reader/live-board.tsx` resets only when `buddyReadId` changes, not after a background and foreground cycle or when sharing is toggled. After a permanent rejection, reporting stays off until the reader remounts. This is accepted: a permanent answer means the membership or the read changed, and reopening the book re-checks.
- **Clock skew across devices:** `sentAt` is compared per user and buddy read, so it compares clocks across one user's devices. A stop from a device whose clock is behind another device's last report is ignored, and the user drops off only after `LIVE_IDLE_MS` (30 s). Known and accepted.
- **AC #7** stays open until TASK-175.5 or the manual pass verifies it in a browser.

## AC #7 verified in a browser (2026-09-28, TASK-175.5)
`apps/capacitor/e2e-app/live-board.spec.ts` covers it.
- Two signed-in members (cy and dee, friends in one buddy read, prepared over the API) open the reader in the /app build. Each sees the other's live dot.
- `page.close({ runBeforeUnload: true })` then closes cy's tab. Dee's board drops cy's live state within 10 s (asserted below `LIVE_IDLE_MS` = 30 s), and cy stays a member.
- **Mutation check:** removing the `pagehide` listener in `pages/reader/live-board.tsx` makes the spec fail, because the board keeps cy until the idle timeout.
- The spec passed in both full `pnpm e2e:app` runs.
<!-- SECTION:NOTES:END -->
