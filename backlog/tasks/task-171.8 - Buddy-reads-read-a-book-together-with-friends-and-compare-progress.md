---
id: TASK-171.8
title: 'Buddy reads: read a book together with friends and compare progress'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 22:11'
updated_date: '2026-09-27 10:59'
labels:
  - social
  - web
  - app
milestone: m-6
dependencies:
  - TASK-171.1
  - TASK-171.2
  - TASK-171.3
  - TASK-171.4
  - TASK-171.6
  - TASK-171.7
documentation:
  - backlog/decisions/ADR-0004-friends-only-book-sharing.md
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
parent_task_id: TASK-171
priority: high
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Read a book together with one or more friends and see where everyone is. Supersedes archived TASK-64 (progress part; highlight reactions and discussion are TASK-171.9).

Depends on TASK-171.2 (friendship and block check, friend-request-by-user-id and block endpoints), TASK-171.4 (inbox for invites), TASK-171.7 (sharing + content origin, which guarantees identical content), TASK-171.1 (handle, display name, avatar for showing participants), TASK-171.3 (Social tab and signed-out entry point) and TASK-171.6 (`isSharingSuspended`).

Book identity: a buddy read is bound to a **content origin** (ADR-0004). Every participant's book must have that origin, so all participants tokenize the same content and `wordPosition` values compare exactly (ADR-0002). Books imported independently cannot join the same buddy read, even if they look identical.

Scope:
- **Create**: from a book's detail page (`apps/capacitor/src/pages/library/book-detail.tsx`), "Start buddy read", invite accepted friends. The cap is **8 participants including the host**, and pending invites count toward it. Creator is the host. Only books that exist server-side with content can start one (the same eligibility as sharing in TASK-171.7: synced, not tombstoned, not a series chapter). Starting and inviting are refused, with the reason shown, while the host's sharing is suspended (`isSharingSuspended`, TASK-171.6).
- **Invite**: invitees get an inbox item. Before joining, the invite shows the host, the book's title and author, the current participants, and states plainly that the invitee's progress on this book (percent, chapter, last active, finished) will be visible to current and future participants, and that a copy will be added to their library if they do not have one. Declining is silent: the invite leaves the host's pending list and nobody is notified. The host can cancel a pending invite. An invite becomes void when the buddy read ends or finishes, the inviter is no longer a member, a block exists either way, the friendship between inviter and invitee ends, or 30 days pass.
- **Join**: if the invitee already has a non-deleted book with the same origin, it is linked; otherwise joining delivers a copy through the TASK-171.7 accept-copy path (same field rules, same checks: friendship, block, suspension, sync eligibility). A suspended invitee can join with a book they already hold but cannot receive a copy. If no active member still holds a copy source, joining fails with a clear reason.
- **Membership**: host can invite more friends (still the host's own friends only) and remove participants; any participant can leave. A member who left or was removed can rejoin only through a new invite. If the host leaves, host passes to the longest-standing member; the last one leaving ends and deletes it. Unfriending does not remove anyone; joining was consent to the group. Leaving, removal, or the buddy read ending never removes the book from anyone's library. A removed member is not notified; the buddy read disappears from their lists.
- **Membership states**: an invitee is *invited* until they join, decline or the invite is void; invitees are not members. A *current member* has joined and has not left or been removed, and their linked book is still present and not tombstoned (a missing or deleted book counts as left, see "Book gone"). A buddy read is *in progress* until everyone has finished, then *finished*; it *ends* when it is deleted (last member left).
- **Shared-buddy-read check**: this task implements the named "shares an active buddy read" server check that TASK-171.2's friend-request and block endpoints call (TASK-171.2 ships it as a stub returning false). It is true when both users are current members of the same buddy read that has not ended (in progress or finished) and neither is banned. Invitees, members who left or were removed, and members whose book is gone do not count. Block state is checked by the TASK-171.2 endpoints themselves.
- **Progress**: the server reads each participant's position from their own `sync_books.word_position` / `word_count` for the linked book, with no new sync payload. Progress is as fresh as each participant's last sync push (the app schedules a debounced push a few seconds after position saves, while online). Show per participant: percent, current chapter title, words ahead/behind you, last active time (relative, e.g. "2 hours ago"), finished state.
- **Pace goal (optional)**: the host may set or clear a target end date. Each member sees whether they are on pace: on pace means their percent is at least the elapsed share of the time between the buddy read's start and the target date. Per-chapter schedules are out of scope.
- **Finish**: a participant crossing the finished threshold (`isFinishedPercent` in `@lesefluss/core`) after joining is marked finished; others get an inbox item. When everyone has finished, the buddy read moves to finished: it stays listed read-only with final progress, takes no new invites, and members can still leave it.
- **Book gone**: a participant whose linked book is deleted, wiped or taken down counts as left. After a takedown of the origin, members see "this book is no longer available" instead of progress.
- **Co-participant actions** (participant list): a co-participant who is a friend opens their friend profile (TASK-171.5). One who is not a friend shows only the identity card (handle, display name, avatar) and their progress in this buddy read; there is no profile to open. Non-friends get an "Add friend" action that calls TASK-171.2's request-by-user-id endpoint and then shows the relationship state it returns (request pending, or friends when it auto-accepted a request from them). A declined request keeps showing pending, as TASK-171.2 requires. Every co-participant also has a "Block" action calling TASK-171.2's block endpoint; afterwards each is hidden from the other in the buddy read. Across a block neither action is shown, because the other person is hidden.
- **Surfaces and states**:
  - Social tab: active and finished buddy reads, with an empty state explaining how to start one from a book.
  - Book detail: buddy-read card with participants, progress and pace.
  - Reader: participants' positions as markers on the progress bar/scrubber in scroll, page and RSVP modes (no names over text; tap a marker to see who). Refresh on open and at most every 60 s while foregrounded.
  - Signed out: "Start buddy read" shows the TASK-171.3 sign-in explanation. Local-only books show why a buddy read is unavailable. Offline: cached data with an offline notice, actions disabled, markers keep their last-known positions. A failed fetch shows a retry.
- **Privacy**: participants see each other's progress for this book only, regardless of profile visibility settings (joining is consent). Members need not be friends with each other; co-membership grants no profile access, and a non-friend co-participant sees only the identity card and buddy-read progress. Leaving stops sharing immediately, and non-members (never joined, left, removed) get not-found for the buddy read. Participants are shown by handle, display name and avatar (TASK-171.1), never `user.name` or `user.email`. A block between two participants hides each from the other everywhere in the buddy read (participant list, markers, finish items) while both stay members; banned users are hidden from others.
- **Account deletion**: memberships and pending invites removed, host handed over, buddy reads with no remaining members deleted.
- **Docs**: add "Buddy read" to the Social section of `CONTEXT.md`; update the privacy policy (`apps/web/src/routes/privacy/index.tsx`): progress on a buddy-read book is visible to its participants, it stops on leaving, buddy-read records are deleted when the last member leaves or with the account, and co-participants can send each other friend requests.

Out of scope: comments/reactions (TASK-171.9), live races (TASK-171.12), push notifications (TASK-171.11), invites to anyone who is not the inviting host's friend, buddy reads of series/web-novel chapters, per-chapter pace schedules, the friend-request and block endpoints themselves (TASK-171.2).

Implementation notes verified against the code are in the Implementation Notes section of this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A user can start a buddy read from a book's detail page and invite accepted friends, up to 8 participants including the host with pending invites counted toward the cap
- [x] #2 Starting a buddy read is refused, with a reason, for local-only, tombstoned and series-chapter books and while the host's sharing is suspended
- [x] #3 Signed-out users get the sign-in explanation instead of the start action, and the Social tab list shows an empty state when the user has no buddy reads
- [x] #4 An invite shows the host, book, current participants and a statement that the invitee's progress on this book will be visible to participants, before the invitee joins
- [x] #5 Declining an invite notifies nobody; the host can cancel a pending invite; an invite is void once the buddy read ends or finishes, a block exists, the friendship ends, the inviter is no longer a member or 30 days have passed
- [x] #6 An invitee who has a book with the same origin joins with that book; one who does not receives an identical copy on join that appears on their device without a manual sync, on native and web build
- [x] #7 A book with a different origin can never be linked to the buddy read
- [x] #8 Joining enforces the same friendship, block, suspension and sync-eligibility checks as book sharing, and fails with a reason when no member still holds a copy source
- [x] #9 Host can invite and remove participants; anyone can leave; host passes on when the host leaves; the buddy read is deleted when the last member leaves
- [x] #10 Leaving, being removed or the buddy read ending never removes the book from the member's library
- [x] #11 Non-members, including members who left or were removed, get not-found for the buddy read and see no participant's progress
- [x] #12 Concurrent joins never exceed the participant cap, and a buddy read never has zero or two hosts while it has members
- [x] #13 Each participant sees every other participant's percent, current chapter, words ahead or behind, and last active time, identified by handle, display name and avatar only
- [x] #14 Two members who are not friends see each other's buddy-read progress and identity card only; membership opens no profile, and only a co-participant who is a friend links to their friend profile
- [x] #15 Progress reflects each participant's last synced position without any new sync payload fields
- [x] #16 When participants' word counts for the same origin differ, words ahead or behind is hidden and the comparison is marked approximate
- [x] #17 The host can set and clear a target end date, and each member sees whether they are on pace for it
- [x] #18 The reader shows participant markers on the progress bar in scroll, page and RSVP modes and refreshes them no more often than every 60 seconds, and not while backgrounded or offline
- [x] #19 Tapping a participant marker shows who is there without changing the reader's own position
- [x] #20 Offline, buddy-read screens show cached data with an offline notice and disable actions; a failed fetch shows a retry
- [x] #21 Reaching the finished threshold after joining marks the participant finished and notifies the others; a book already finished before joining does not count, and a later backwards position does not undo it
- [x] #22 The buddy read finishes when all participants have finished and then stays listed read-only and accepts no invites
- [x] #23 A participant whose linked book is tombstoned, hard-deleted, cleared with the cloud-data wipe or taken down is treated as having left, and after a takedown of the origin members see that the book is no longer available
- [x] #24 After a block between two participants, neither sees the other in the participant list, reader markers or finish notifications, and banned users are hidden from all participants
- [x] #25 Deleting an account through the account page, better-auth deleteUser and the admin delete action each removes the user's memberships and pending invites, hands over host if needed and deletes empty buddy reads
- [x] #26 CONTEXT.md defines Buddy read, and the privacy policy states that buddy-read progress is visible to participants, stops on leaving and is deleted with the last member or the account, and that co-participants can send each other friend requests
- [x] #27 Integration tests against Postgres cover origin enforcement, join-with-copy, cap and host handover under concurrency, invite voiding, leave, non-member access, finish transitions, missing or deleted linked books, block visibility and all three account deletion paths
- [x] #28 The 'shares an active buddy read' check replaces TASK-171.2's stub: it is true only when both users are current members (joined, not left or removed, linked book present) of the same buddy read that has not ended, in progress or finished, and neither is banned; invitees never count
- [x] #29 The participant list shows an 'Add friend' action on each co-participant who is not a friend, calling TASK-171.2's request-by-user-id endpoint, and then shows request pending or friends from the returned state; a declined request still shows pending
- [x] #30 The participant list offers a 'Block' action on every co-participant; after blocking, each is hidden from the other in the buddy read and neither 'Add friend' nor 'Block' is shown across the block
- [x] #31 An end-to-end test: two non-friends in the same buddy read can send and accept a friend request; after one of them leaves, a new friend request between them is refused with not-found, and a block between co-participants is accepted by the block endpoint while both are members
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation plan

### 1. Core (`packages/core/src/social.ts`)
- `BUDDY_READ_MAX_PARTICIPANTS = 8`, `BUDDY_READ_INVITE_TTL_DAYS = 30`, `BUDDY_READ_PROGRESS_REFRESH_MS = 60_000`; `SOCIAL_API.buddyRead*` (create, invite, inviteCancel, inviteRespond, leave, removeMember, targetDate, list, get, progress); Zod bodies (`CreateBuddyReadBodySchema { bookId, inviteeIds[] }`, `BuddyReadInviteBodySchema { buddyReadId, inviteeIds[] }`, `InviteIdBodySchema`, `InviteRespondBodySchema { inviteId, action }`, `BuddyReadIdBodySchema`, `RemoveMemberBodySchema`, `TargetDateBodySchema { buddyReadId, targetDate: number | null }`).
- Types: `BuddyReadSummary { id, originKey, title, author, status, hostHandle, memberCount, pendingInvites, targetDate, myBookId, createdAt }`, `BuddyReadDetail` (summary plus `isHost`, `host: SocialIdentity`, `originUnavailable`, `approximate`, `participants: Participant[]`, `invites` for the host), `Participant { identity, isSelf, isHost, isFriend, relationship: RelationshipState, bookId (self only), percent | null, wordPosition, wordCount, lastActiveAt | null, finishedAt | null }`, `BuddyReadProgress { participants: { userId, name, wordPosition, wordCount, percent }[], approximate }`; inbox types `buddy_read_invite`, `buddy_read_joined`, `buddy_read_finished`; `InboxSubject` gains `{ kind: "buddy_read_invite"; inviteId; buddyReadId; state: pending | accepted | declined | unavailable; book: { title, author }; host: SocialIdentity; participants: SocialIdentity[] }`. Error copy for `full`, `already_member`, `not_member`, `not_host`.

### 2. Database (`0027_buddy_reads.sql`)
- `buddy_read`: id, `origin_user_id`/`origin_book_id` (no FK), `host_id` (FK set null; the effective host is the stored one while a current member, else the earliest-joined current member), `title`, `author` (snapshot for lists and invites), status (`in_progress` | `finished`), `target_date`, `created_at`, `finished_at`. Index on the origin.
- `buddy_read_member`: PK `(buddy_read_id, user_id)`, both FK cascade, `book_id` (the linked row), state (`active` | `left` | `removed`), `joined_at`, `left_at`, `finished_at`. Index `(user_id)`.
- `buddy_read_invite`: id, `buddy_read_id`, `inviter_id`, `invitee_id` (all FK cascade), status (`pending` | `accepted` | `declined` | `cancelled`), `created_at`, `resolved_at`; partial unique `(buddy_read_id, invitee_id) WHERE status = 'pending'`.
- No client migration; buddy-read state stays in TanStack Query.

### 3. Server (`lib/social/buddy-reads.ts`, `buddy-read-items.ts`, `buddy-read-hooks.ts`)
- One definition of *current member*: state `active` and the linked `sync_books` row present with `deleted = false`. Used by `sharesActiveBuddyRead` (replaces the stub in `buddy-read-eligibility.ts`, adds "neither banned"), by member-to-member visibility (current members, no block either way, neither banned) and by every read.
- `createBuddyRead(hostId, { bookId, inviteeIds })`: shareable source row (`isShareableRow`), origin not taken down, host not suspended; inserts the read (origin, title, author, host) and the host's member row, then invites each id through the same path as below.
- `inviteMembers(hostId, id, inviteeIds)`: `FOR UPDATE` on the read; host must be a current member; read in progress; host not suspended; each invitee an accepted friend of the host (`areFriends`), not a current member, no pending invite; current members plus pending unexpired invites stay below 8; `buddy_read_invite` item to the invitee (subject = invite id).
- `cancelInvite(hostId, inviteId)`: pending → cancelled, item deleted. Hooks: `onFriendshipRemoved` and `onBlock` cancel pending invites between the pair.
- `inviteState(invite, now)`: void (`unavailable`) when the read is gone or finished, the inviter is no longer a current member, a block exists either way, the two are no longer friends, or 30 days passed. Read by the inbox and by accept.
- `respondToInvite(userId, inviteId, action)`: `FOR UPDATE` on the read; pending and not void or `unavailable`; decline is silent (item marked read). Accept: cap under the lock; a live copy of the origin in the invitee's library is linked; otherwise a suspended invitee is refused (`suspended`), else the source is the host's linked row when still shareable, else any current member's row with that origin and content, else `unavailable`; `copyBookForUser(…, via: "buddy_read")`; member row inserted or a `left`/`removed` row reactivated with fresh `joined_at` and cleared `finished_at`; invite accepted, item marked read; `buddy_read_joined` items for the other current members.
- `leaveBuddyRead(userId, id)`: under the lock, `active` → `left`; when no current member remains the read is deleted. `removeMember(hostId, id, userId)`: host only, `active` → `removed`, no item. `setTargetDate(hostId, id, date | null)`.
- Reads: `listBuddyReads(userId)` (reads where the user is a current member, with `originKey` so the app matches its local book), `getBuddyRead(userId, id)` (`not_found` unless a current member; participants filtered by the visibility gate; percent from `readingProgress` when `word_count` is set, `lastActiveAt` = `updated_at` clamped to now; `approximate` when visible participants' word counts differ; `originUnavailable` from `isOriginTakenDown`; relationship state per participant from `listRelationships`-equivalent lookups; host's pending invites with invitee identity), `getBuddyReadProgress(userId, id)` (the marker payload: positions and word counts only). Every read deletes reads with no current member and settles finishes (below).
- Finish: `settleBuddyReads(userId, bookIds)` marks a membership finished the first time its row's percent is at or past `FINISHED_PERCENT_THRESHOLD` after `joined_at`, never undone; `buddy_read_finished` items to the other current members; when every current member is finished the read becomes `finished`. Called best-effort after the sync push transaction commits (outside it) for the pushed book ids, and lazily by `getBuddyRead`.
- Account deletion: FK cascades remove memberships and invites, host is derived, empty reads are deleted on the next read; `purgeUserSyncData` also deletes reads whose only current member was the user (one query) so nothing waits for a lazy pass.
- Routes under `api/social/`: `buddy-read` (POST create), `buddy-read-invite`, `buddy-read-invite-cancel`, `buddy-read-invite-respond`, `buddy-read-leave`, `buddy-read-remove-member`, `buddy-read-target-date`, `buddy-reads` (GET list), `buddy-read-detail` (GET `?id`), `buddy-read-progress` (GET `?id`, 120/min). Inbox lists invite items through `buddy-read-items.ts` (host, book, current participants, state) and counts them while the invite row is pending or resolved.

### 4. App
- `services/social/buddy-reads.ts` hooks (list, detail, progress with `refetchInterval` 60 s gated on foreground and online, create, invite, cancel, respond with `syncNow` after join, leave, remove, target date) plus `useSendFriendRequest` in `friends.ts`.
- Social tab: "Buddy reads" row links to `/tabs/social/buddy-reads` (active and finished lists, empty state explaining the start from a book). Detail page `/tabs/social/buddy-read/$id`: header (title, author, host, status, pace line from target date, "no longer available" when the origin is gone), participants with avatar/name/handle, percent, chapter title (viewer's local chapters), words ahead/behind or "approximate", last active, finished, host badge; row menu: open profile (friend) / Add friend (state from the response) / Block; host actions: Invite friends (multi-select sheet of accepted friends not yet in), Remove, Set target date, Cancel invite; Leave with confirmation; offline notice and disabled actions; retry on error.
- Book detail: "Start buddy read" header action (signed out: the sign-in explanation) opening a friend multi-select sheet; a buddy-read card for the read matching the book's `originKey` (participants, progress, pace, link to the detail page).
- Inbox: `buddy_read_invite` row with host, book, participants, the visibility statement, Join / Decline; `buddy_read_joined` and `buddy_read_finished` copy.
- Reader: `useBuddyReadMarkers(book)` finds the read by `originKey`, polls progress at most every 60 s while visible (`visibilitychange` + `appStateChange`) and online, and renders markers inside the existing progress bar in all three modes (dots at `wordPosition / own wordCount`); a marker's pointer events stop propagation so tapping shows a small "who is here" popover without scrubbing.

### 5. Docs and tests
- `CONTEXT.md` Buddy read; privacy policy paragraph; `docs/social-buddy-reads.md`.
- `buddy-reads.integration.test.ts`: create and refusals (local-only, series, tombstone, suspended host, taken-down origin), invite cap with pending invites, non-friend invite refused, decline silent, cancel, voiding (unfriend, block, inviter left, expiry, finished read), join linking an existing copy, join with a delivered copy and its fields, different origin never linked, suspended invitee, no source left, cap under concurrent joins, host handover and deletion on last leave, remove and rejoin only by new invite, non-member not_found, progress payload with percent/last active/approximate, finish transitions (already-finished book does not count, backward position keeps finish, all finished), book gone counts as left, block hides both ways, banned hidden, `sharesActiveBuddyRead` semantics including the 171.2 end-to-end (request between co-members accepted, refused after one leaves, block accepted while members), all three deletion paths. `account-deletion.integration.test.ts` extended; `friends.integration.test.ts` keeps its mock.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Server tables (e.g. `buddy_reads` with origin columns, host, pace goal, status; `buddy_read_members` with `(buddy_read_id, user_id)` unique, linked `book_id`, role, state, joined/left/finished timestamps) go in `apps/web/src/db/schema.ts` with a generated migration in `apps/web/drizzle/`. Endpoints are TanStack Start routes under `apps/web/src/routes/api/` with `middleware: [cors, requireAuth]`, rate-limited with `checkLimit` keyed by user id; the app calls them through the shared authed-fetch helper extracted from `syncFetch` (parent TASK-171), so bearer (native) and cookie (web build) both work. No local SQLite table or migration is needed: buddy-read state is fetched with TanStack Query.
- A member's linked book is identified by `(user_id, book_id)`; the server `book_id` is the same 8-char hex id the device uses locally, so the app matches it to its local book without a lookup table.
- `sync_books.updated_at` is the position revision (see the comment in `schema.ts` and `lastWriteWins` in `apps/web/src/lib/sync-book-upsert.ts`), so it serves as "last active". It is a client-supplied timestamp: clamp it to the server's now when displaying. Positions merge with last-write-wins, so a participant's position can move backwards; a recorded buddy-read finish must not be undone by that.
- `word_count` is nullable on older rows. Show percent as unknown rather than 0 when it is null, and compute percent with `readingProgress` from `@lesefluss/core` so it matches the rest of the app.
- Do not use `sync_books.finished_at` alone for buddy-read finish: it is sticky and records the first crossing ever, so a participant who linked a book they had already finished would count as finished at once. Record the buddy-read finish on the membership, the first time the member's position is observed at or past the threshold after joining. Nothing in the server observes a push today: either evaluate transitions in `apps/web/src/routes/api/sync.ts` POST after the book upsert transaction commits (best-effort and outside that transaction, so a social failure can never fail a sync), or evaluate lazily when buddy-read state is read. Finish inbox items need the first option or an equivalent hook.
- Current chapter title: compute it on the client from the viewer's own local `chapters` (identical content means identical chapters), instead of selecting the large `chapters`/`content` columns in progress queries. Server progress queries select only position, word count, revision and deleted.
- For the viewer's own row in the comparison, use the local position (fresher than the last push), not the server's.
- "Book gone" has more causes than a pushed tombstone: `clearCloudData` in `apps/web/src/lib/profile.ts` hard-deletes all of a user's `sync_books` rows, `hardDeleteAdminTombstones` and `deleteAdminBook` in `apps/web/src/lib/admin.ts` remove or tombstone rows, the server cascade-tombstones series chapters, and a TASK-171.6 takedown tombstones every copy of an origin. Treat a membership whose linked row is missing or `deleted = true` as left whenever state is read, in addition to any eager handling on push. A takedown of the origin therefore ends the buddy read for everyone.
- Joining with a delivered copy: pick the host's linked row as the copy source; if the host's row is gone, use any active member's row with that origin and content. The copy follows TASK-171.7's field rules exactly (fresh `bookId`, `wordPosition = 0`, fresh `updatedAt`/`metadataUpdatedAt`), and the app triggers a pull after join so the book appears without a manual sync.
- Concurrency: do join, invite, leave, remove and host handover in one transaction that locks the buddy-read row (`SELECT ... FOR UPDATE`), so concurrent joins cannot exceed the cap, and a host leaving while another member leaves cannot leave the read with no host or two hosts. Re-check friendship, block and suspension inside the join transaction.
- Account deletion has three paths (`deleteUserAccount` in `lib/account-deletion.ts`, better-auth `user.deleteUser.afterDelete` in `lib/auth.ts`, and `deleteAdminUser` in `lib/admin.ts`, which deletes sync tables inline and does not call `purgeUserSyncData`). An FK cascade from membership to `user` removes rows on all three, but cannot hand over host or delete an emptied buddy read. Either make the host derivable (earliest-joined active member when the stored host is gone) and treat a buddy read with no members as deleted, or route all three paths through one purge function. Extend `account-deletion.integration.test.ts`.
- Tokenizer skew: positions compare exactly only when both devices applied the same `WordIndex` rule. If participants' `word_count` values for the same origin differ, show percent but hide words ahead/behind and mark the comparison as approximate, rather than showing a wrong number.
- Reader markers: the progress bar in `apps/capacitor/src/pages/reader/` (`scroll-view.tsx`, `page-view/index.tsx`, `rsvp-view.tsx`, gestures in `use-scrub-progress.ts`) treats a tap as a jump. Tapping a marker must show who is there without moving the reader's own position. Place markers from `wordPosition` against the viewer's own local word count. Pause refresh when backgrounded: listen to both `document` `visibilitychange` (web build) and Capacitor `App` `appStateChange` (native), as `use-reading-session.ts` does, and skip refresh while offline.
- Rollout: nothing is added to the sync payload, so older app builds keep working; a participant on an old build still pushes positions and stays visible to others, they just cannot see the buddy read themselves.
- Visibility between members: the TASK-171.2 helper checks "friends, no block either way, neither banned", but two members may never have been friends, and unfriending must not hide progress. Gate member-to-member visibility on "both current members, no block either way, neither banned" (reuse the block and ban parts of that helper), and use the full friends check only for invites and joins.
- Pending invites need their own state (e.g. a `buddy_read_invites` table or an invite state on the membership row) so the cap can count them, the host can cancel them, and voiding rules (friendship ended, block, expiry, read ended) can be evaluated when the invite is read or accepted. The inbox item from TASK-171.4 only points at the invite.

Cross-task contracts (from the final review of the TASK-171 set):
- **Join with a copy** calls TASK-171.7's copy function, so the same field rules apply (no `sourceUrl`, no hide flag, position 0) and a copy record is written. Join and invite creation also refuse origins for which `isOriginTakenDown` is true, and invite creation checks `isSharingSuspended` for the inviter.
- **Deletion mechanism (decided):** membership and invite rows reference `user.id` with `onDelete: "cascade"`, and the host is derived (the stored host if still a member, else the earliest-joined active member), so host handover needs no purge code. A buddy read with no members left is deleted lazily the next time it is read and inside the leave transaction. Deleting a buddy read is a real row delete, and TASK-171.9 and TASK-171.12 hang their tables off `buddy_read_id` with `onDelete: "cascade"`.
- **Blocks are symmetric.** When either of two participants blocks the other, neither sees the other anywhere in the buddy read (the wording "removes the blocker's visibility" elsewhere means the same thing).
- **Reusable pieces for later subtasks:** the participant-marker layer on the progress bar is a generic marker layer that TASK-171.9 (discussion markers) reuses, and TASK-171.9 adds its own columns to the membership row (monotonic `furthestWord`, "share all my highlights", "show everything"). Invite inbox items use TASK-171.4's generic void or expired state for cancelled, blocked, unfriended, ended and 30-day-old invites.
- **Client plumbing**: TASK-171.1's authed-fetch helper and TASK-171.3's social query key prefix, so the social-cache clear covers buddy-read queries.

- **Shared-buddy-read check (for TASK-171.2):** export it from the buddy-read server module under the name TASK-171.2's stub uses, taking two user ids and returning a boolean. Implement it as one indexed query over the membership table: both rows joined, not left or removed, same buddy read, buddy read not deleted, neither user banned, and each linked `sync_books` row present with `deleted = false` (the same "book gone counts as left" rule used when state is read). Use this same current-member definition in the member-to-member visibility gate so the participant list, the friend-request check and the block check never disagree. A pending friend request created while both were members stays valid after one leaves (TASK-171.2); only new requests are refused.

Implementation (2026-09-27):
- Migration `0027_buddy_reads.sql` (journal idx 27) adds `buddy_read`, `buddy_read_member` (with `finish_armed`), `buddy_read_invite`. Applied to the dev DB and `lesefluss_phone`.
- Server: `lib/social/buddy-reads.ts` (every write locks the read row and runs `settle`: gone books count as left, finishes recorded and notified, host derived, empty reads deleted, read finishes when all members have), `buddy-read-items.ts` (inbox subject), `buddy-read-hooks.ts` (cancel invites on unfriend/block), `buddy-read-eligibility.ts` now real (`isCurrentMember`, `sharesActiveBuddyRead`). Inbox liveness for invite/joined/finished items. `settleBuddyReads` runs best-effort after the sync push commits. `purgeCloudData` calls `endBuddyReadsOf`, which covers Clear cloud data and all three account deletion paths. New SocialError codes `full`, `already_member`, `not_host`.
- Decision: after an origin takedown members stay active and see only `originUnavailable` (instead of the read vanishing), so AC #23's "members see the book is no longer available" holds.
- Decision: `finish_armed` column instead of comparing timestamps, so a book finished before joining only counts after it was seen below the threshold.
- App: `services/social/buddy-reads.ts`, `FriendPickerSheet`, pages `/tabs/social/buddy-reads` and `/tabs/social/buddy-read/$id`, book-detail "Start buddy read" (sign-in explanation when signed out) and card, inbox invite rows, reader markers (`pages/reader/buddy-read-markers.tsx`) in the shared progress bar with a tap popover.
- Docs: CONTEXT.md Buddy read, privacy section "Buddy reads", `docs/social-buddy-reads.md`.
- Tests: `buddy-reads.integration.test.ts` (19 tests) plus full suites: web 151, core 121, capacitor 662, all green; tsc clean on web, core, app.
- Device check (Pixel, `lesefluss_phone`): invite in inbox with visibility statement, Join linked the existing same-origin copy, detail showed 50% / 600 words ahead / host badge, reader marker at 50% and tapping it showed the popover without moving the position. Only scroll mode was checked on device; page and RSVP use the same progress bar element.
- Gotcha: the web dev server's route generator overwrote `routes/api/sync.ts` with a scaffold when a script truncated and rewrote it; restored from the index. Write route files via temp file + move while the dev server runs.

Review pass (5 agents, 2026-09-27), findings verified and fixed:
- `endBuddyReadsOf` locked reads in unordered RETURNING order (deadlock between two purges sharing reads): now deduped and sorted.
- `createBuddyRead` duplicate guard raced on a double-tap: the host's user row is locked first (`lockUsers`).
- `removeBuddyReadMember` worked across a block (existence oracle): the target must be visible to the host.
- Host's pending-invite list after a host handover could show a user blocked with the new host: filtered through `visibleTo`.
- Invite decline returned success when the invite was already gone: now not_found.
- `settleBuddyReads` ran for every membership on every full-snapshot push: limited to unfinished memberships.
- App: foreground refetch invalidated buddy-read progress and broke the 60 s cap (now excluded); progress now refetches on mount when stale; takedown copy no longer claims the read ended; the slider role moved from the bar to the track so assistive tech reaches the marker buttons.
- Removed the unused `isCurrentMember` helper and corrected the docs; fixed a garbled comment.
- Tests added: `isOnPace` unit tests (core), rejoin after a finish clears it, host cannot remove a member hidden by a block. Suites: web 152, core 126, app 662.

Not changed:
- better-auth's `/api/auth/delete-user` runs `beforeDelete` (the purge, now including buddy-read effects) in its own transaction before deleting the user row. This predates buddy reads; the app's own deletion path is atomic. Options: disable the better-auth route or accept.
- `listBuddyReads` settles each read in its own locking transaction; bounded by the user's number of reads.
- Client-side ACs (#16, #18-#20) are verified manually on device, not by component tests.

Full device pass (2026-09-27, Pixel + web build, `lesefluss_phone`): start from book detail with invites, cancel and re-invite, join linking an own copy, join with a delivered copy (appeared without manual sync), silent decline, target date set/clear, reader markers in scroll, page and RSVP with non-scrubbing tap popover, progress polling measured through a logging proxy (60-68 s apart, no extra poll on app switches, none in background), Add friend (declined still shows sent), Block hiding both ways incl. markers, remove and rejoin by new invite, leave with host handover (book kept), finish via a real sync push incl. notification and read-only finished view, signed-out sheet on book detail, web build list and inbox.

Fixed during the pass: last-active used calendar days ("yesterday" for 3 h ago), now `formatAgo`; on-pace compared a fractional elapsed share so 0% read as behind minutes after the start, now whole percents (test added); empty-state copy with only finished reads; SocialGate hid cached pages once a refetch failed (pre-existing from 171.3), now blocks only without data; finished member with unknown word count showed an empty bar; accepted invite card lost "Hosted by" once the viewer became host.

Open, not fixed: Android WebView never reports offline (navigator.onLine stays true in airplane mode), so offline notices and disabled actions never engage on native; social cache is memory-only, so a cold start without the server shows only the gate's retry; web build flashes the signed-out gate before the session is restored; the sync upsert overwrites `word_count` with a pushed null, which turns a member's percent into unknown.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Buddy reads: up to 8 people read one content origin together and see each other's progress.

Server: three new tables (migration 0027), `lib/social/buddy-reads.ts` with create, invite, cancel, respond (links an existing same-origin copy or delivers one via `copyBookForUser`), leave, remove, target date, list, detail and marker progress. All writes lock the read row and settle it: gone books count as left, finishes are recorded once and notified, the host is derived, empty reads are deleted. The `sharesActiveBuddyRead` stub is replaced by the real check. The inbox gains invite, joined and finished items. Finishes settle after each sync push, outside its transaction. Clear cloud data and every account deletion path end memberships and delete emptied reads.

App: Buddy reads list and detail pages (progress, chapter, words ahead/behind or approximate, last active, pace, Add friend, Block, Report, host invite/remove/target date, leave, offline handling), a book-detail start action and card, inbox Join/Decline with the visibility statement, and reader participant markers with a non-scrubbing tap popover, polled at most every 60 s while foreground and online.

Docs: CONTEXT.md, privacy policy, docs/social-buddy-reads.md. Tests: 19 new integration tests; web, core and app suites green; checked on device.
<!-- SECTION:FINAL_SUMMARY:END -->
