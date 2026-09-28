---
id: TASK-175.4
title: Missing tests from the social tasks
status: Done
assignee:
  - '@claude'
created_date: '2026-09-28 16:19'
updated_date: '2026-09-28 17:04'
labels:
  - tests
  - social
dependencies: []
parent_task_id: TASK-175
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tests promised by earlier social tasks that do not exist yet, found in the branch review. All database tests run against a throwaway migrated database.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 TASK-171.2: the pending-request cap (100) and friend cap (1000, both sides) are covered by integration tests (rows inserted in bulk)
- [x] #2 TASK-171.6: unban, a 30-day sharing suspension expiring, and a permanent suspension not expiring are covered by integration tests
- [x] #3 TASK-171.9: exceeding the comment and reaction rate limits returns 429 with reason rate_limited (route-level or factory-level test with the real limits)
- [x] #4 TASK-171.10: a taken-down book's events are hidden, Clear cloud data hides the user's events, and events exactly at and just past the 90-day boundary are shown and hidden respectively
- [x] #5 packages/core reading-credit.ts has unit tests for creditCeilingWpm (modes, dial clamp), refillCredit (cap at the burst) and spendCredit (backward, partial credit)
- [x] #6 TASK-171.15: the opt-out test drives the viewer through sharesLive (a real social_profile row with share_live_reading false) instead of faking isLive
- [x] #7 The admin deletion path (deleteAdminUser) is covered by an account-deletion integration test
- [x] #8 TASK-174 AC #4: unit coverage added if feasible, otherwise a note on why it stays Playwright-only
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan
Tests only. A production change happens only if a test exposes a real bug, and that bug is reported to the coordinator first. Every database test runs on a throwaway migrated database.

1. **#1, friend caps** (`lib/social/friends.integration.test.ts`, new describe block with its own users):
   - Filler users and rows are inserted in bulk.
   - **Pending cap:** 99 pending outgoing requests are inserted directly. The 100th request through `sendFriendRequest` succeeds, and the 101st is `limit_reached`. An expired pending request (older than the TTL) does not count.
   - **Friend cap:** 999 friendships are inserted in bulk. The 1000th, through `createFriendship`, succeeds; one more is `limit_reached`, on either side of the pair: requester at the cap, and addressee at the cap.
2. **#2, moderation** (`lib/moderation/moderation.integration.test.ts`):
   - **30-day suspension:** active on day 29, gone on day 31.
   - **Permanent suspension:** still active ten years on, and ends only when lifted.
   - **Unban:** a banned user (the `banned` flag, as better-auth writes it) is hidden from interaction. After the unban write (`banned` false, reason and expiry cleared) they can interact again, and the friendship is intact. A timed ban ends by the clock (`banExpires`).
   - **Discussion** (`lib/social/buddy-read-discussion.integration.test.ts`): there is no suspension coverage yet. A 30-day suspension refuses highlight sharing and turning on share-all on day 29, and allows both after day 31. Shares and buddy reads already cover a suspended sender or host.
3. **#3, discussion rate limits** (`lib/social/discussion-rate-limits.test.ts`, new):
   - Imports the real route modules (comment, reply, edit, reaction). The middleware and the discussion functions are mocked; `socialPost` and the rate limiter are real.
   - Comment: the 30th post is 200 and the 31st is 429 `rate_limited`.
   - Reply and edit share the comment bucket.
   - Reactions: the 120th is 200 and the 121st is 429.
   - Reactions and comments do not spend each other's budget.
4. **#4, feed** (`lib/social/feed.integration.test.ts`):
   - A takedown through `takeDownBooks` hides the event.
   - `purgeCloudData` hides the user's events.
   - At the 90-day boundary, an event at exactly `now - 90d` is shown, and one at `now - 90d - 1ms` is hidden and deleted.
5. **#5, reading credit** (`packages/core/src/__tests__/reading-credit.test.ts`, new):
   - `creditCeilingWpm`: the non-RSVP modes, RSVP with the dial times 1.25, the dial clamped to `MAX_PLAUSIBLE_WPM`, and a null, zero or negative dial.
   - `refillCredit`: linear refill, capped at `CREDIT_BURST_WORDS`, and negative elapsed time adds nothing.
   - `spendCredit`: moving backwards or not at all, partial credit, fractional budget, and whole words only.
6. **#6, live opt-out** (`lib/social/live.integration.test.ts`): a new test opens a stream while sharing, then writes a real `social_profile.share_live_reading = false` through `updateOwnProfile`. `sweep` turns the open stream to `live: false` through the real `sharesLive`, with no mocked `liveChecks`.
7. **#7, admin deletion** (`lib/account-deletion.integration.test.ts`):
   - `deleteAdminUser` runs through a minimal `createServerFn` shim and a mocked `auth.getSession`, so the real handler and the real `deleteUserAccount` run.
   - An admin deletes the user, and their social rows (profile, handle release, friendship, feed event) are gone.
   - A non-admin gets 403 and nothing is deleted.
8. **#8, TASK-174 AC #4:** the rewind guards live inline in `index.tsx` `useCallback`s over refs, together with virtua measurements, and unit-testing them would mean extracting production code in the fragile position path. They stay Playwright-only (`e2e/position-end-of-book.spec.ts`, 6 tests), and a note says why.
9. **Verify:** the full web `pnpm test` on a throwaway database, the core tests, and Biome. Every new assertion is checked against a plausible regression, for example by flipping a boundary.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation (2026-09-28)
Tests only; no production code changed. No test exposed a bug.

- **#1** `friends.integration.test.ts`, new describe block "friend caps (integration)". It uses its own users plus 1,000 filler users, inserted in one statement.
  - "the pending cap allows the 100th outgoing request and refuses the 101st; expired ones do not count": 99 fresh pending requests and 1 expired one are inserted in bulk. The 100th request through `sendFriendRequest` succeeds, and the 101st is `limit_reached` and writes no row.
  - "the friend cap allows the 1000th friend and refuses the 1001st, on either side": 999 friendships are inserted in bulk. The 1000th through `createFriendship` succeeds, and the next is `limit_reached` in both argument orders. With the addressee at 1,000 it is `limit_reached` in both orders too.
- **#2**
  - `moderation.integration.test.ts`:
    - "a 30-day suspension holds on day 29 and has run out on day 31" goes through `decideNotice`, with the 30d duration.
    - "a permanent suspension never runs out; only lifting it ends it": `until` is null, it is still active ten years on, and it ends only when lifted.
    - "a ban hides the user until it runs out or is lifted, and the friendship survives it": the unban is the write better-auth's `unbanUser` makes (`banned` false, reason and expiry null). `canInteract` and `areFriends` return, and a timed `banExpires` ends by the clock.
    - The bystander is the target, so the repeat-offender auto-suspension does not interfere.
  - `buddy-read-discussion.integration.test.ts`: "a 30-day sharing suspension refuses sharing highlights until it runs out" (new; the discussion had no suspension coverage). `shareHighlight` and switching share-all on are `suspended` on day 29; switching it off stays allowed. Both work on day 31. Shares and buddy reads already covered a suspended sender or host.
- **#3** `discussion-rate-limits.test.ts` (new). It imports the real route modules (comment, reply, edit, reaction), mocking only the auth and CORS middleware and the discussion functions; the factory and limiter are real, with the real `BUDDY_*_RATE_LIMIT`.
  - "the comment after the limit is refused with rate_limited": the 30th is 200, the 31st is 429 `rate_limited`, and another user is unaffected.
  - "replies and edits draw on the same comment budget".
  - "the reaction after the limit is refused, and reactions and comments are counted apart": the 120th is 200 and the 121st is 429.
- **#4** `feed.integration.test.ts`:
  - "an event exactly 90 days old is shown; a millisecond older is hidden and removed".
  - "a taken-down book's events and, after Clear cloud data, all the user's events are hidden", through `takeDownBooks` and `purgeCloudData`. The feed hides them from friends and from the owner.
  - Both use dan. By then the file's shared state has blocked ben.

- **#5** `packages/core/src/__tests__/reading-credit.test.ts` (new, 12 tests):
  - `creditCeilingWpm`: non-RSVP modes, the dial with headroom, the clamp to `MAX_PLAUSIBLE_WPM`, and a null, zero or negative dial;
  - `refillCredit`: pro rata, capped at the burst, and zero or negative elapsed time;
  - `spendCredit`: full, partial, whole words keeping the fraction, backward or still, and an empty or overdrawn bucket.
- **#6** `live.integration.test.ts`: "the sweep reads a viewer's stored opt-out and turns their open stream off". An open stream is live and shows cy. `updateOwnProfile(bo, { shareLiveReading: false })` writes the real row, and then the real `sweep` (no mocked `liveChecks`) pushes `{ live: false, members: [] }`. The existing opt-out test already opened its stream through the real `sharesLive`. The `viewer()` helper that fakes `isLive: true` stays for the snapshot-only tests, where only visibility is under test.
- **#7** `account-deletion.integration.test.ts`: "an admin deletes a user through deleteAdminUser, social data included; a non-admin cannot".
  - Server functions only execute inside the Start runtime, so a test-only `createServerFn` shim calls the real handler with its input, and `auth.getSession` is mocked. `requireAdminSession`, the handler and `deleteUserAccount` are real.
  - A non-admin gets a 403 Response and every row stays.
  - An admin removes the user, profile, friendship, feed event and books. The handle is released (`user_id` null, `released_at` set), and the friend's account stays.
- **#8** stays Playwright-only. The TASK-174 guards are inline in `pages/reader/index.tsx` (`handleScrollPositionSettle` and `handleSetProgressWord`, `useCallback`s over `settledWordRef`, `lastWordRef` and `lastJumpAtRef`), and their inputs (`isAtEnd`, `hasMoved`) come from virtua measurements in `scroll-view.tsx`. A unit test would need those guards extracted into a pure function, a production change in the position path the user asked to keep untouched. The six `e2e/position-end-of-book.spec.ts` tests cover the resize-without-settle case and the unmount-flush value against the real scroller, and were mutation-checked in TASK-174.

## Verification
- **Mutation checks:** 20 temporary production mutations, each restored from a backup afterwards; each was caught by the new tests:
  - `>=` to `>` on both caps; expired requests counted; the friend cap checked on one side only;
  - a 30-day suspension becoming 32 days; permanent becoming 30 days;
  - a ban ignoring `banExpires`;
  - the discussion suspension checks removed, for a single share and for share-all;
  - the reply bucket split from comments; reactions sharing the comment key;
  - the feed cutoff `>=` changed to `>`; cleanup disabled; tombstones not filtered;
  - the sweep ignoring the opt-out;
  - `deleteAdminUser` without `requireAdminSession`, or deleting the user row without the purge;
  - the dial unclamped; the refill uncapped; spending with no floor.
- **Web:** fresh throwaway database (create, `drizzle-kit migrate`, drop), full `pnpm test`: 26 files, 225 of 225 (212 before, plus 13 new). `tsc --noEmit` is clean.
- **Core:** `pnpm test`, 11 files, 142 of 142 (130 plus 12). tsc is clean.
- **Biome:** clean on `apps/web/src` and `packages/core/src`.
- **Capacitor:** not touched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adds the tests the social tasks promised but never had. Every test is checked against a mutation of the production code it guards (20 mutations, all caught), and no production code changed.

- **Friend caps:** the pending-request cap (100, expired requests excluded) and the friend cap (1,000, either side), with bulk-inserted rows, at the boundary and one past it.
- **Moderation:**
  - a 30-day suspension on days 29 and 31;
  - a permanent suspension ten years on, ended only by lifting it;
  - ban, unban and a timed ban, with the friendship kept;
  - a discussion highlight-share refused while suspended.
- **Discussion rate limits:** tested through the real route modules. The comment limit is 30, shared by reply and edit; the reaction limit is 120, counted apart from comments.
- **Feed:**
  - the 90-day boundary (exactly 90 days shown, 1 ms older hidden and removed);
  - a takedown hides that book's events;
  - Clear cloud data hides all of the user's events.
- **Reading credit (core):** unit tests for the ceiling per mode and the dial clamp, refill capped at the burst, and spending (partial, whole words, backward).
- **Live board:** the sweep reads a real stored opt-out and turns an open stream off.
- **Admin deletion:** `deleteAdminUser` runs its real admin check and full purge, and refuses a non-admin with 403.
- **TASK-174 AC #4:** stays covered by Playwright only, since a unit test would need production code extracted in the fragile position path (see notes).

Verified on a throwaway database: web 225 of 225, core 142 of 142; tsc and Biome clean.
<!-- SECTION:FINAL_SUMMARY:END -->
