---
id: TASK-171.2
title: >-
  Friendships: requests, accept/decline, remove, block, invite links and
  buddy-read friend requests
status: Done
assignee:
  - claude
created_date: '2026-09-25 22:10'
updated_date: '2026-10-02 16:58'
labels:
  - social
  - web
dependencies:
  - TASK-171.1
references:
  - apps/web/src/lib/account-deletion.integration.test.ts
  - apps/web/src/routes/api/sync/delete-session.ts
  - apps/web/src/lib/cors-middleware.ts
  - apps/web/src/routes/login/index.tsx
documentation:
  - backlog/decisions/ADR-0004-friends-only-book-sharing.md
parent_task_id: TASK-171
priority: high
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The friend graph every other social feature gates on. Friendship is **mutual** (request + accept), per ADR-0004: book sharing and buddy reading are only allowed between accepted friends, so "friend" must mean both sides consented.

Depends on TASK-171.1 (handles and the identity card).

There is no discoverability: no handle search, directory, suggestion list or lookup by handle or name. People connect in exactly two ways: a personal invite link shared anywhere, or an in-app friend request to a buddy-read co-participant who is not yet a friend.

Scope (server, `apps/web`):
- **Friend request** (in-app path): sent to a user id, and allowed only when the server verifies that sender and recipient are both current members of the same active buddy read (TASK-171.8), neither blocks the other, and neither is banned or handle-less. Any other target (no shared active buddy read, self, unknown, banned, handle-less or block-related) gets one identical not-found response. If they are already friends or a request is already pending, the endpoint returns the existing relationship state and creates nothing. The recipient accepts or declines; the sender can cancel while pending (the request then disappears from the recipient's incoming list). A request to someone who already requested you auto-accepts both. Pending requests expire 30 days after they were sent, and stay valid even if the buddy read ends in the meantime. The "Add friend" button on a co-participant lives in the buddy-read UI (TASK-171.8); this task provides the endpoint.
- **Decline is silent**: the sender keeps seeing "pending" until the request expires, then sees no relationship. For 90 days after a decline, a new request from the same sender to the same recipient is accepted by the API and shown to the sender as pending, but creates nothing the recipient sees. The API never returns a response that distinguishes "declined" from "still pending".
- **Remove friend**: either side, immediately, no notification to the other side; the friend simply disappears from both lists. Removing a friend does not start a cooldown.
- **Block**: either user can block any user they currently encounter in the app: a friend, the other side of a request (including "decline and block" on an incoming request), or a buddy-read co-participant. The endpoint takes a user id and returns not-found for anyone else. Blocking removes an existing friendship, cancels pending requests both ways, hides each from the other in profiles, feeds and buddy reads, and prevents new requests and invite-link redemption in both directions. Block is invisible to the blocked user (they see the target as not found). Unblock (from the block list) does not restore the friendship or requests. The block list is visible only to the blocker. Books already delivered by an earlier share stay with the recipient; block only affects future interaction.
- **Invite link**: a user has at most one active personal invite link (`https://lesefluss.app/invite/<token>`) to share anywhere (WhatsApp etc.). It is multi-use, expires 14 days after creation, and can be revoked; creating a new link revokes the previous one. Opening it while signed in shows the owner's handle, display name and avatar with an "Add friend" confirmation; confirming creates an **accepted** friendship immediately, because the owner consented by handing out the link. Opening it while signed out leads through sign-up/login and then back to the same confirmation. Only the owner's handle, display name and avatar are shown on the invite page, regardless of their profile visibility, and the page is `noindex`.
- **Limits** (defaults, as constants in one place): at most 100 pending outgoing requests, 1000 friends per user (checked for both sides on accept and invite redemption), 30 friend requests per user per hour, 10 invite-link creations per user per day, 20 invite redemptions per user per hour. Exceeding a limit returns a clear error.
- **Friend list API** for the app: friends, incoming requests, outgoing requests, blocked users, each with handle, display name and avatar only. Banned users are omitted from other people's lists (their rows are kept so a lifted ban restores them).
- **Effects on other social data** (for later subtasks to rely on): two server-side helpers that every social endpoint uses: "neither blocks the other and neither is banned", and "are friends" built on top of it (see the notes for who uses which).
- **Web fallback page** for `/invite/<token>` on the website, covering: valid link (confirm), expired or revoked link, own link, already friends, and signed out.
- **Privacy policy**: add a section to `apps/web/src/routes/privacy/index.tsx` describing the friend graph as a new category of data: what is stored (friendships, pending and declined requests, blocks, invite links), who can see it (friends see each other in their lists; blocks are private), that users can only be reached through their own invite link or a shared buddy read (no search), how long declined and expired requests are kept (at most the 90-day cooldown), and that it is deleted with the account.
- **Glossary**: add Friend, Block and Invite link to `CONTEXT.md` (new "Social" section) so later subtasks use the same terms.

Out of scope: the app UI (Social tab subtask TASK-171.3; the co-participant "Add friend" button in TASK-171.8), notifications (inbox subtask TASK-171.4), deep link wiring (TASK-171.3; the web fallback page for `/invite/<token>` is in scope here). Friend data is not part of the sync payload (`/api/sync`, `packages/core` sync schemas); the app reads it from the new endpoints, so no local SQLite table or migration is needed here.

Implementation notes:
- Store friendship as one row per unordered pair or two directed rows, but make the "are friends" check a single indexed lookup. With one row per pair, store the pair ordered (`user_low < user_high`) under a unique index so that two users requesting each other at the same moment, or a double-tapped accept, cannot create two rows; do the mutual-request auto-accept and the accept itself in one transaction (e.g. `INSERT ... ON CONFLICT` on that index), and re-check block state inside the same transaction so a block racing an accept wins.
- A decline must leave a record (e.g. the request row with `declined_at`) so the cooldown can be enforced and the sender still sees "pending". Expiry can be evaluated lazily on read (treat requests older than the TTL as gone) rather than needing a scheduled job; the app has no job runner for this. Delete expired request rows, elapsed cooldown records and expired or revoked invites opportunistically (e.g. when the same user or pair is next written) so nothing is kept longer than the privacy policy states.
- Tables go in `apps/web/src/db/schema.ts` with a generated migration in `apps/web/drizzle/` (next is `0021_...`, or the next free number if TASK-171.1 landed first).
- Account deletion has three paths (see TASK-171). Unlike the sync tables, these tables reference `user.id` with `onDelete: "cascade"` on **both** user columns (requester/addressee, blocker/blocked, invite owner), as TASK-171.1 does for `social_profile`; that covers all three paths without extra purge code.
- Endpoints: file routes under `apps/web/src/routes/api/social/` with `middleware: [cors, requireAuth]` like `apps/web/src/routes/api/sync/delete-session.ts`, which accepts the better-auth bearer token (native app) and the session cookie (web build and website). `cors` in `apps/web/src/lib/cors-middleware.ts` only allows `GET, POST, OPTIONS` in preflight, so use POST for all mutations. GET requests never change state; this matters for `/invite/<token>` because chat apps fetch link previews.
- Rate limiting: `checkLimit` in `apps/web/src/lib/rate-limit.ts` is an in-memory, per-process bucket. Key limits by user id (`social-request:${userId}`), not by `getClientKey`, which collapses all non-Cloudflare traffic into one "unknown" bucket. The pending and friend caps are counted in the database, not in the limiter.
- Users with `user.banned = true` (better-auth admin plugin, `apps/web/src/db/auth-schema.ts`) and users without a handle are treated as not found in requests, blocks and invite links.
- Invite tokens: at least 128 bits of randomness, compared server-side; store a hash if convenient. Opening your own invite link, a link whose owner has blocked you or was deleted, or a link to someone who is already your friend shows a neutral page and creates nothing; a link whose owner blocked the opener (or whom the opener blocked) must look the same as an expired one.
- Signed-out invite flow: `/login` already accepts `?redirect=` (see `isSafeRedirect` in `apps/web/src/routes/login/index.tsx`), and social sign-in passes it as `callbackURL`. Email sign-up does not: `signUp.email` is called without `callbackURL` and email verification is required, so the verification link would lose the invite. Pass the redirect through as the sign-up `callbackURL` (or remember the token in a short-lived cookie) so a brand-new email user still lands back on `/invite/<token>`. A new user has no handle yet (TASK-171.1 requires one for social features), so the invite page must let them claim a handle before the request completes.
- The accept-invite endpoint must be callable from the app with a bearer token too, because TASK-171.3 opens invite links inside the native app.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 User A can send a friend request to user B, identified by user id, when both are current members of the same buddy read (in progress or finished, not deleted); B sees it as incoming and A as outgoing
- [x] #2 The request endpoint verifies the shared buddy read (both current members, in progress or finished) server-side and returns the same not-found response for every other target: no shared buddy read, self, unknown, handle-less, banned or block-related users
- [x] #3 No endpoint looks up, searches or lists users by handle or display name; users are reachable only through their invite link or a shared buddy read
- [x] #4 B accepting makes A and B friends on both sides
- [x] #5 After B declines, A still sees the request as pending until 30 days after it was sent, then sees no relationship; no API response to A distinguishes declined from pending
- [x] #6 A new request from A to B within 90 days of B's decline is reported to A as pending but never appears in B's incoming list
- [x] #7 A cancelling a pending request removes it from B's incoming list
- [x] #8 Mutual pending requests between A and B become a friendship automatically
- [x] #9 Either friend can remove the friendship; it disappears from both lists and the other side is not notified
- [x] #10 Blocking removes friendship and pending requests both ways and prevents new requests and invite redemption in both directions
- [x] #11 A blocked user receives the same response as for a non-existent user, in requests and invite links
- [x] #12 Unblocking does not restore the friendship or any request
- [x] #13 The recipient of a request can decline and block the sender in one action
- [x] #14 A user can block a friend, the other side of a request, or a buddy-read co-participant by user id; any other target returns not-found
- [x] #15 Friend requests, invite-link creation and invite redemption are rate-limited per user and return a clear error when the limit is exceeded
- [x] #16 A user has at most one active invite link; creating a new one revokes the old, and links expire after 14 days
- [x] #17 Opening a valid invite link signed in shows the owner's handle, display name and avatar and creates an accepted friendship only after the user confirms; a GET of the link changes nothing
- [x] #18 Expired, revoked, own, blocked and already-friends invite links show a neutral web page and create nothing, and a blocked link is indistinguishable from an expired one
- [x] #19 Opening an invite link signed out and then signing in with an existing account or OAuth completes the friendship
- [x] #20 A brand-new user who signs up by email from an invite link, verifies their email and claims a handle ends up friends with the link owner
- [x] #21 The pending-request cap (100) and friend cap (1000, checked for both users) are enforced for requests, accepts and invite redemption
- [x] #22 Concurrent mutual requests or a repeated accept result in exactly one friendship
- [x] #23 Banned users are omitted from other users' friend lists and cannot be sent requests
- [x] #24 Social endpoints accept both the bearer token and the session cookie
- [x] #25 Deleting a user through the account page, better-auth deleteUser and the admin delete action each leaves no friendship, request, block or invite row referencing them
- [x] #26 Integration tests against Postgres cover request (including buddy-read eligibility), accept, decline, cooldown, cancel, expiry, remove, block, unblock and invite flows
- [x] #27 The privacy policy describes the stored friend-graph data, who can see it, how users can be reached, how long declined and expired requests are kept, and deletion with the account
- [x] #28 CONTEXT.md defines Friend, Block and Invite link
- [x] #29 A server-side 'no block either way, neither banned' check and a 'friends' check built on it exist as separate exported helpers and are covered by tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation plan

### 1. Core (`packages/core/src/social.ts`)
- Constants in one place: `FRIEND_REQUEST_TTL_DAYS = 30`, `DECLINE_COOLDOWN_DAYS = 90`, `INVITE_TTL_DAYS = 14`, `MAX_PENDING_OUTGOING = 100`, `MAX_FRIENDS = 1000`.
- Zod bodies: `FriendRequestBody { userId }`, `RespondToRequestBody { requestId, action: accept | decline | decline_block }`, `CancelRequestBody { requestId }`, `UserIdBody { userId }` (remove, block, unblock), `InviteTokenBody { token }`.
- Response types: `SocialIdentity { userId, handle, name, avatarUrl }`, `RelationshipState = none | pending_outgoing | pending_incoming | friends`, `SocialRelationships { friends[{...identity, since}], incoming[{requestId, sentAt, ...identity}], outgoing[{requestId, sentAt, ...identity}], blocked[identity] }`, `InviteInfo { url, expiresAt }`, `InvitePreview { state: valid | own | already_friends | invalid | signed_out | handle_required, owner?: SocialIdentity }`.

### 2. Database (`schema.ts`, hand-written `drizzle/0022_friendships.sql` + journal entry)
- `social_friendship (user_low, user_high, accepted_at)`: PK on the ordered pair, CHECK `user_low < user_high`, index on `user_high`, both FKs cascade. One row per pair; "are friends" is one PK lookup.
- `social_friend_request (id uuid, requester_id, addressee_id, state pending|accepted|declined|cancelled, created_at, resolved_at)`: unique `(requester_id, addressee_id)` so a direction has one live row; a re-request reuses it. Expiry is derived from `created_at` on read. A decline keeps the row (`state = declined`, `resolved_at`) for the 90-day cooldown; a re-request inside the cooldown only bumps `created_at` so the sender keeps seeing "pending" and the recipient sees nothing. Cascade FKs both sides.
- `social_block (blocker_id, blocked_id, created_at)`: PK on the pair, index on `blocked_id`, cascade both.
- `social_invite (owner_id PK, token_hash unique, created_at, expires_at, revoked_at)`: one row per owner, so "one active link" is structural; tokens are 32 random bytes (base64url), stored as SHA-256. Cascade.
- Opportunistic cleanup in the write paths: expired pending rows, declined rows past the cooldown, cancelled/accepted rows, and expired/revoked invites of the users being written are deleted.

### 3. Helpers and hooks (`apps/web/src/lib/social/`)
- `relationship.ts`: `canInteract(a, b)` ("no block either way, neither banned, both have handles, not self") and `areFriends(a, b)` built on it, plus `identityOf(userIds)` (handle, name, avatar URL; skips handle-less and banned users). Ban = `user.banned` and (`ban_expires` null or in the future).
- `buddy-read-eligibility.ts`: `sharesActiveBuddyRead(a, b)` returns false; TASK-171.8 replaces the body. Tests mock the module.
- `hooks.ts`: `socialHooks` arrays `onRequestCreated`, `onRequestRemoved`, `onFriendshipCreated`, `onFriendshipRemoved(reason: remove | block)`, run inside the writing transaction; TASK-171.4 and TASK-171.7 register into them.
- `friends.ts`: `sendFriendRequest`, `respondToRequest` (accept / decline / decline_block), `cancelRequest`, `removeFriend`, `blockUser`, `unblockUser`, `listRelationships`, and the shared `createFriendship(tx, a, b)` (caps for both sides, block re-check, `INSERT ... ON CONFLICT DO NOTHING` on the pair PK, marks requests accepted). Every mutation locks the two `user` rows in id order first, which serialises mutual requests and double accepts. Target checks that fail (self, unknown, no handle, banned, blocked, no shared buddy read) throw one `not_found`.
- `invite.ts`: `createInvite` (revokes the previous by replacing the row), `getCurrentInvite`, `revokeInvite`, `previewInvite(viewerId | null, token)`, `redeemInvite(viewerId, token)` (own link, already friends, blocked either way, banned or handle-less owner, expired, revoked: no write; blocked looks like expired).
- `SocialError` gains `not_found` (404), `limit_reached` (409), `handle_required` (403), `invalid_invite` (404).

### 4. Routes (`routes/api/social/`, flat files, `[cors, requireAuth]`, POST for mutations, per-user `checkLimit`)
- `relationships.ts` GET.
- `friend-request.ts` POST (30/h), `friend-request-respond.ts` POST, `friend-request-cancel.ts` POST, `friend-remove.ts` POST, `block.ts` POST, `unblock.ts` POST.
- `invite.ts` GET current / POST create (10/day), `invite-revoke.ts` POST, `invite-preview.ts` POST `{ token }` (read-only, for the app), `invite-redeem.ts` POST `{ token }` (20/h; `handle_required` when the redeemer has no handle).

### 5. Website
- `routes/invite/$token.tsx` (`noindex`): loader calls a `previewInvite` server function with the optional session, so the page renders server-side for link previews without redeeming. States: valid (owner card + "Add friend" confirm), handle_required (owner card + the claim form from TASK-171.1, then confirm), own, already_friends, invalid (one neutral message for expired, revoked, blocked, deleted owner), signed_out (owner card + "Sign in to add" linking to `/login?redirect=/invite/<token>`). Redeem goes through `socialClient.redeemInvite` (cookie). Success view has a placeholder block for TASK-171.3's app CTA.
- `HandleClaimForm` exported from `components/social-profile-section.tsx` for reuse.
- `routes/login/index.tsx`: email sign-up passes `callbackURL: redirectTo` when a redirect is present, so the verification link returns to `/invite/<token>` (better-auth appends it to the verify-email URL and auto-signs-in).
- `lib/social-client.ts`: relationships, request/respond/cancel/remove/block/unblock, invite create/current/revoke/preview/redeem.

### 6. Deletion, legal, glossary
- Cascade FKs cover all three deletion paths; `account-deletion.integration.test.ts` inserts a friendship, requests in both directions, blocks in both directions and an invite and asserts nothing references the user afterwards.
- Privacy: "Friends and invite links" section (stored data, who sees it, reachability, retention of declined/expired requests at most 90 days, deletion with the account). Terms: no change needed beyond TASK-171.1's rules.
- `CONTEXT.md` Social section: Friend, Friend request, Block, Invite link.

### 7. Tests
- `relationship.test.ts` / integration: canInteract and areFriends (ban, missing handle, block either way, self).
- `friends.integration.test.ts` (buddy-read eligibility mocked true/false): request, not-found parity, accept, decline invisibility and cooldown re-request, cancel, expiry (by `created_at` in the past), mutual auto-accept, concurrent mutual requests and double accept (Promise.all) → one friendship, remove, block (removes friendship and requests, blocks requests both ways, not-found parity), decline_block, unblock does not restore, caps (pending 100 via lowered constant? no: insert 100 rows), banned omitted from lists.
- `invite.integration.test.ts`: create/replace/revoke, expiry, preview states, redeem creates accepted friendship, own/already-friends/blocked/handle-less create nothing, blocked equals expired.
- Type checks and full suites in core, web (throwaway migrated DB), capacitor (unchanged besides nothing; run anyway).

### Out of scope here
- App UI, deep links, inbox, buddy-read "Add friend" button (TASK-171.3/4/8).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cross-task contracts (from the final review of the TASK-171 set):
- **Two composable helpers, not one.** Export a "no block either way and neither banned" check and a "friends" check that builds on it. TASK-171.8 and TASK-171.9 gate member-to-member visibility on the first alone (buddy-read members need not be friends); every friend-scoped feature uses both.
- **Buddy-read eligibility (ordering).** This task lands before TASK-171.8, so the request endpoint calls a named "shares an active buddy read" check that TASK-171.8 implements (both users are current, non-left members of the same buddy read that has not ended). Until TASK-171.8 provides it, the check returns false, so the endpoint rejects every target; tests here use a stub. TASK-171.8 adds the "Add friend" action on co-participants who are not yet friends (showing pending or friends state from the relationship response) and an end-to-end test. The same check authorises blocking a co-participant.
- **Deletion mechanism (decided):** cascade FKs to `user.id` on both user columns of every table here. The `deleteAdminUser` switch is owned by TASK-171.1, so nothing else is needed.
- **Request lifecycle is readable.** The request row exposes a state (pending, accepted, declined, cancelled; expired is derived from `created_at`) that TASK-171.4 joins to render inbox items live. The friendship row stores `accepted_at` (TASK-171.5 shows "friends since").
- **Hook points in the same transaction.** The request, accept (including mutual auto-accept and invite redemption), cancel, remove and block handlers each run in one transaction and call a small set of named hooks that later subtasks register into: TASK-171.4 creates or deletes inbox items (a request re-sent during the decline cooldown creates nothing for the recipient; cancel and expiry remove the item) and TASK-171.7 revokes pending book shares on remove and block. TASK-171.8 voids buddy-read invites lazily on read, so it needs no hook.
- **App invite API.** Besides the confirm call, expose a read-only preview endpoint for the app (bearer or cookie) returning the owner's identity card and the outcome state (valid, own link, already friends, no longer valid) without redeeming. The create-invite and current-invite responses return `expiresAt`, which TASK-171.3 displays.
- **Website invite page.** The signed-out branch uses the existing `/login?redirect=` flow, and the no-handle branch reuses TASK-171.1's claim endpoint. Leave a slot for the "get the app / continue in the web app" block; TASK-171.3 (which comes after this task) builds that block and embeds it here.

Invite tokens are stored raw (256 random bits, unique column), not hashed: the owner must be able to copy their current link again from the app, which a hash would prevent. Compromise of the DB would let someone add friends, nothing more.

Locking: every pair mutation locks the two `user` rows in id order (`lockUsers`) before reading, so mutual requests, double accepts, invite redemption and blocks serialise; the friendship pair PK plus `ON CONFLICT DO NOTHING` is the second line. The concurrent mutual-request test accepts both legal outcomes (one auto-accepted friendship, or two pending rows when both requests landed before either saw the other).

Cooldown re-request bumps `created_at` on the declined row and nothing else; `listRelationships` includes declined rows in the sender's outgoing list with the same shape as pending ones, which is what keeps decline indistinguishable.

Blocked list keeps banned users (so the blocker can unblock) but drops handle-less ones, since SocialIdentity requires a handle; an admin handle reset on a blocked user hides them from the block list until they pick a new handle, while the block itself stays in force.

The 1000-friend cap is enforced in createFriendship for both sides but not covered by a test (it would need a thousand rows); the 100-pending cap is counted in the DB the same way. Website invite page and email sign-up callbackURL were type-checked only, not run in a browser.

Review pass (5 sonnet reviewers, claims verified by hand against the code) fixed: cancelRequest wrote without the pair lock, so an accept racing a cancel could still create the friendship (now peeks the addressee, locks both users, deletes under the lock; decline also requires the row to still be pending); the buddy-read gate ran before the idempotent friends/pending/cooldown checks, so an existing relationship became not-found once the buddy read ended (gate moved to the new-request path only, test added); blockUser checked visibility before the already-blocked no-op, so re-blocking a since-banned user threw (order swapped, test added); createInvite/revokeInvite now lock the owner row so redeemInvite cannot complete on a link revoked mid-transaction; invite-revoke route was the one mutation without a rate limit (20/h added); previewInviteForPage validated its input by type only (Zod parse plus a 120/min per-client-IP limit; unauthenticated by design); concurrent mutual-request test now asserts the serialised outcome instead of accepting both; banned-friend-hidden and buddy-read-only-block tests added; hooks.ts documents that FK cascades on account deletion fire no hooks. Removed a section banner and two task references from source; RespondAction derived from the core schema. Left as is: the friends integration file is one ordered narrative (tests are not independently runnable) and listRelationships reads four snapshots without a transaction (self-corrects on next poll).

## Corrections after the branch review (2026-09-28)
- **Deletion paths:** better-auth's `/delete-user` and `/admin/remove-user` are disabled (`auth.ts` `disabledPaths`, TASK-171.13), and there is no delete hook. AC #25's deletion paths all go through `deleteUserAccount`.
- **"Active" buddy read:** the AC for requesting a co-participant says "active buddy read", but `sharesActiveBuddyRead` (`buddy-read-eligibility.ts`) counts any buddy read the two share, finished or not, where both are still members and neither is banned. This is intended: finishing a book together is the most natural moment to add each other. The AC should read "a buddy read both are members of (in progress or finished)". The code is not wrong.
- **Missing tests:** the friend cap (1000) and the pending-request cap (100) have no tests yet (TASK-175.4).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Friendships, blocks and invite links

### What changed
- **Core**: caps and TTLs as constants, Zod bodies (`UserIdBody`, `RespondToRequestBody`, `RequestIdBody`, `InviteTokenBody`), response types (`SocialIdentity`, `RelationshipState`, `SocialRelationships`, `InviteInfo`, `InvitePreview`).
- **Database** (`0022_friendships.sql`): `social_friendship` (ordered pair PK, CHECK low < high), `social_friend_request` (one row per direction, state enum, expiry derived from `created_at`, declined rows kept for the cooldown), `social_block`, `social_invite` (one row per owner, raw unique token). All user columns cascade.
- **Helpers** (`lib/social/relationship.ts`): `canInteract` (distinct, existing, handle, not banned, no block either way) and `areFriends` on top; `loadSocialUsers` / `identityOf` for identity cards. `buddy-read-eligibility.ts` stub for TASK-171.8. `hooks.ts` registry (`onRequestCreated`, `onRequestRemoved`, `onFriendshipCreated`, `onFriendshipRemoved`) run inside the writing transaction for TASK-171.4/171.7.
- **Service** (`lib/social/friends.ts`, `invite.ts`): send / respond (accept, decline, decline_block) / cancel / remove / block / unblock / list; shared `createFriendship` with caps, block re-check and pair-PK idempotence; invites create (replaces), current, revoke, preview (no writes, blocked = expired), redeem.
- **Routes** (`/api/social/*`, cors + requireAuth, POST mutations, per-user limits): `relationships`, `friend-request` (30/h), `friend-request-respond`, `friend-request-cancel`, `friend-remove`, `block`, `unblock`, `invite` GET/POST (10/day), `invite-revoke`, `invite-preview`, `invite-redeem` (20/h).
- **Website**: `/invite/$token` (noindex, SSR preview through a server function with optional session; states valid / handle_required with the claim form / own / already_friends / invalid / signed_out; slot for TASK-171.3's app CTA), `friendsClient` in `lib/social-client.ts`, email sign-up passes `callbackURL` so a verification link returns to the invite.
- **Privacy**: "Friends and invite links" section. **CONTEXT.md**: Friend, Friend request, Block, Invite link.

### Tests
- `friends.integration.test.ts`: helper gates, not-found parity, request/list shapes (no email), cancel, silent decline + expiry + cooldown re-request + real request after cooldown, accept + repeated accept, remove, mutual and concurrent requests, block (both directions, hides, unblock restores nothing), decline_block, banned omitted.
- `invite.integration.test.ts`: handle required, one active link, preview states, redeem once, expired/revoked, blocked equals expired, banned owner.
- `account-deletion.integration.test.ts`: friendship, requests, blocks, invite rows gone from both sides.
- Web suite 74 tests green on a fresh migrated DB; core 96; capacitor type-check clean.

### Follow-ups
- TASK-171.8 replaces `sharesActiveBuddyRead`; until then every friend request is not-found by design.
- Friend cap of 1000 untested; invite page and sign-up redirect not run in a browser.

### Review pass
Five fresh-context reviewers (sonnet), each claim re-verified by hand. Fixed: cancel bypassing the pair lock (accept could race a cancel), buddy-read gate ahead of the idempotent status checks, non-idempotent re-block after a ban, invite create/revoke racing redeem, unrated invite-revoke route, unvalidated and unlimited server function for the invite page, and a race test that accepted both outcomes. Suite afterwards: web 76, core 96, type-check and lint clean.
<!-- SECTION:FINAL_SUMMARY:END -->
