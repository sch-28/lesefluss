---
id: TASK-171.4
title: 'In-app social inbox: friend requests, shares, buddy-read invites and reactions'
status: Done
assignee:
  - claude
created_date: '2026-09-25 22:10'
updated_date: '2026-09-26 17:54'
labels:
  - social
  - web
  - app
milestone: m-6
dependencies:
  - TASK-171.2
  - TASK-171.3
parent_task_id: TASK-171
priority: medium
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Users need to notice when something social happens to them without push notifications (deferred to a later subtask). The inbox is the single list of "things that need your attention or happened to you".

Depends on TASK-171.2 (friend events) and TASK-171.3 (Social tab to host it). This subtask ships only the two friend events; the other types in the title are added by the subtasks that introduce them, on top of the table and UI built here.

Scope:
- **Server**: a notifications table (recipient, type, actor, subject reference, created, read state) plus endpoints to list (cursor-paginated, newest first), mark one read, mark all read, and a cheap unread count. Every endpoint acts only on the caller's own items.
- **Event types** in this subtask: friend request received, friend request accepted. The type set must be extensible so later subtasks add: book share received / accepted, buddy-read invite / joined / finished, reaction or reply on your buddy-read comment or highlight, report outcome (takedown statement of reasons).
- **Events that deliberately create nothing**: declining a request (TASK-171.2 keeps declines silent to the sender), removing a friend, and blocking. The inbox must never reveal any of these to the other party.
- **Read state**: one `read_at` timestamp; there is no separate "seen" state. The badge counts unread items. An item becomes read when the user taps it, acts on it inline, or uses "mark all read". Opening the inbox does not mark everything read on its own, so a pending request is not silently cleared.
- **Actionable items**: a friend request (and later share and buddy-read invites) can be accepted or declined inline from the inbox.
- **Actor display**: each item shows the actor's handle, display name and avatar as they are now (resolved live from TASK-171.1 profile data, not copied into the row at creation time), so a later name or avatar change or visibility change is respected. Never `user.email`, and never `user.name` or `user.image` unless the actor chose to show them socially.
- **App**: inbox screen in the Social tab, unread badge on the Social tab icon. Unread count refreshes on app foreground, after each sync, and when the Social tab opens. No background polling. The screen has an empty state ("Nothing here yet"), a loading state, and an offline or error state with retry that keeps showing the last cached list if there is one. Signed-out users and users without a handle see the Social tab's existing signed-out and pick-a-handle states from TASK-171.3 instead of the inbox.
- **Privacy**: when either user blocks the other, all inbox items between the pair (both directions) are deleted, so unblocking never resurfaces them. Items whose actor is in a block relation with the recipient are also filtered out at read time as a safety net. Items where a deleted account is the recipient or the actor are removed.
- **Retention**: read items are deleted 90 days after they were read; any item, read or not, is deleted 365 days after creation. This keeps the table minimal (GDPR data minimisation) and bounds its size.
- **Docs**: add "Inbox" to the Social section of `CONTEXT.md`, and add a short paragraph to the privacy policy (`apps/web/src/routes/privacy/index.tsx`) saying that the server stores social notifications about events between the user and their friends, which data they contain, and the retention periods above.

Out of scope: push delivery (push subtask TASK-171.11), email digests, the friends-list request UI (TASK-171.3), and every event type other than the two friend events.

Implementation notes:
- **Server wiring.** Add the table to `apps/web/src/db/schema.ts` with a migration in `apps/web/drizzle/` (latest is `0020_book_added_at.sql`). Index `(recipient_user_id, created_at desc)` for the list and a partial index on unread rows for the count. Endpoints go under `apps/web/src/routes/api/` using the same `middleware: [cors, requireAuth]` pattern as `routes/api/sync.ts` (`requireAuth` is in `apps/web/src/lib/session-middleware.ts`; it resolves both the web-build cookie and the native bearer token via better-auth's `bearer()` plugin). `cors` only allows `GET, POST, OPTIONS` in preflight, so use POST for the mark-read mutations. Rate-limit mutating endpoints with `checkLimit` from `apps/web/src/lib/rate-limit.ts`, keyed by user id; the unread-count endpoint is called on every foreground, so give it a generous separate bucket rather than sharing the sync bucket.
- **Authorization.** Mark-read by id must filter on `recipient_user_id = caller`; an id belonging to another user behaves exactly like a non-existent id (no error that distinguishes the two).
- **Creating notifications.** Insert the notification in the same transaction as the event that causes it (the friend-request and accept handlers from TASK-171.2), so a failed request never leaves an orphaned item and a failed insert rolls back the request. Collapse duplicates: a repeated request from the same actor (for example request, cancel, request again after the cooldown) replaces the existing item for that `(recipient, type, actor, subject)` instead of stacking a new one. A mutual request that auto-accepts creates one "accepted" item for each side, not two "request received" items.
- **Stale actionable items.** A friend request can be resolved elsewhere (accepted from the friends list, on another device, auto-accepted by a mutual request, cancelled by the sender, or removed by a block). The list endpoint must return each actionable item's current state (pending / accepted / declined / gone) by joining the live request row, not a copy frozen at creation time, and the inline accept/decline must call the TASK-171.2 endpoints and treat "already resolved" as success. When a sender cancels a pending request, or the request expires (TASK-171.2 evaluates expiry lazily), delete or hide its "request received" item.
- **Block handling** hooks into the TASK-171.2 block handler (same transaction) to delete the pair's items, and the list and unread-count queries also use the single friendship-and-block helper from TASK-171.2 (or an equivalent join), so the badge never counts hidden items.
- **Account deletion.** There are three deletion paths (see TASK-171): `deleteUserAccount` in `apps/web/src/lib/account-deletion.ts` (used by `apps/web/src/lib/profile.ts`), better-auth's `user.deleteUser.afterDelete` hook in `apps/web/src/lib/auth.ts`, and `deleteAdminUser` in `apps/web/src/lib/admin.ts`. The first two call `purgeUserSyncData`; TASK-171 asks the first social subtask to switch `deleteAdminUser` to `deleteUserAccount`, so check that this has happened. Delete notification rows where the user is recipient or actor inside `purgeUserSyncData` (or reference `user.id` from `apps/web/src/db/auth-schema.ts` with `onDelete: cascade` on both columns, which covers all three paths because each deletes the user row). Extend `apps/web/src/lib/account-deletion.integration.test.ts`.
- **Retention without a scheduler.** The web backend has no cron or job runner (`apps/web/src/lib/admin.ts` notes its maintenance is deliberately manual). Run the cleanup opportunistically, for example a bounded delete of the recipient's own expired rows inside list or mark-read, and also filter expired rows out of list and count queries so a user who never opens the inbox is not shown stale items when they finally do. Rows of users who never open the inbox again are removed when their account is deleted.
- **App fetch helper.** `syncFetch` in `apps/capacitor/src/services/sync/index.ts` is module-private. Use (or create, if TASK-171.3 did not) an exported authenticated fetch helper that adds the bearer token on native and `credentials: "include"` on the web build, and handles 401 the same way sync does.
- **Refresh triggers.** Sync runs are driven from `apps/capacitor/src/contexts/sync-context.tsx` (`useRestoreSession`, `useResumeSync`, `useMobileAuthCallback`, `syncNow`), not from `services/sync/index.ts`. `useResumeSync` is gated on `NATIVE_SYNC_ENABLED`, so the web build does not sync on foreground. Register a separate `CapacitorApp.addListener("resume", ...)` for the unread count that is enabled on both builds (the `@capacitor/app` web implementation fires `resume` on `visibilitychange`), and invalidate the unread-count query after each `fullSync()` in the sync context.
- **Query cache.** The shared `queryClient` (`apps/capacitor/src/services/query-client.ts`) defaults to `staleTime: Infinity` and `retry: false` because it was built for local SQLite. Inbox queries must set their own `staleTime` and rely on explicit invalidation. Nothing clears the cache on sign-out or account switch today (`signOut`, `adoptSyncIdentity`), so remove the inbox and unread-count queries there (TASK-171.3 adds a social-cache clear; add the inbox keys to it), or key them by the signed-in account, so a second account never sees the first account's badge.
- **Badge UI.** `NAV_ITEMS` in `apps/capacitor/src/components/app-shell/nav-items.ts` has no badge concept; the badge must render in both `TabBar.tsx` and `DesktopSidebar.tsx`. Hide it when signed out, when sync is disabled, and when the count request fails (offline must not show an error badge). Cap the displayed number (for example "9+").
- **Rollout.** The inbox is server-only state, so older app versions without the Social tab are unaffected; their users simply accumulate unread items until they update (bounded by retention). Unknown types returned to a client older than the server (types added by later subtasks) must render as a generic item or be skipped, never crash the list; the list response should therefore carry a type string the client matches against a known set.
- **Later types.** Document next to the type set that a future type must not reveal anything the actor's side keeps silent: a "report outcome" item (TASK-171.6) never names the reporter, and no type may reveal declines, removals or blocks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Receiving a friend request creates an unread inbox item; accepting it creates an item for the original sender; a mutual auto-accept creates one accepted item per side
- [x] #2 The inbox item and the friend request it describes are written in the same transaction
- [x] #3 A repeated request from the same actor replaces the existing item instead of adding a duplicate; a cancelled or expired request removes or hides its item
- [x] #4 Declining a request, removing a friend and blocking create no inbox item for the other party
- [x] #5 Each item shows the actor's current handle, display name and avatar only; email, and an account name or image the actor has not chosen to show to friends, never appear in the list response
- [x] #6 The Social tab shows an unread badge in the tab bar and desktop sidebar that updates on app foreground (native and web build), after sync, and when the tab opens
- [x] #7 Friend requests can be accepted or declined directly from the inbox item; an item whose request was already resolved elsewhere shows its current state and no longer offers the action
- [x] #8 Tapping or acting on an item marks it read, a mark-all-read action clears the badge, and opening the inbox alone does not mark items read
- [x] #9 Mark-read with another user's item id behaves like a non-existent id and changes nothing
- [x] #10 Blocking deletes all inbox items between the two users in both directions, and unblocking does not bring them back
- [x] #11 Items whose actor is in a block relation with the recipient are excluded from both the list and the unread count
- [x] #12 Deleting an account through any of the three deletion paths removes inbox items it received and items where it is the actor
- [x] #13 Read items older than 90 days after reading, and all items older than 365 days, are neither listed nor counted and are deleted without requiring a scheduler
- [x] #14 Signing out or switching accounts clears the cached inbox and badge
- [x] #15 The inbox screen shows an empty state, and when offline or on a failed request shows an offline or error state with retry instead of a broken list
- [x] #16 The client renders or skips notification types it does not know without failing the list
- [x] #17 The notification type set is documented in code so later subtasks can add types without schema changes, including the rule that no type may reveal declines, removals, blocks or a reporter's identity
- [x] #18 The privacy policy describes stored social notifications and their retention, and CONTEXT.md defines Inbox
- [x] #19 Tests cover creation, duplicate collapsing, silent events, listing order, unread count, mark-read and its authorization, block deletion and filtering, retention cleanup and account-deletion purge
- [x] #20 When someone redeems a user's invite link and the friendship is created, the link owner gets an unread inbox item naming the new friend
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation plan

### 1. Core (`packages/core/src/social.ts`)
- `NOTIFICATION_TYPES = ["friend_request_received", "friend_request_accepted", "friend_joined_via_invite"]` with a doc comment holding the rules for later types (no type may reveal declines, removals, blocks or a reporter; each later subtask appends its own; room for the push category mapping), `NotificationType`.
- Types: `InboxItem { id, type, createdAt, readAt, actor: SocialIdentity, subject: { kind: "friend_request", requestId, state: pending | accepted | declined | gone } | null }`, `InboxPage { items, nextCursor }`, `UnreadCount { count }`. Zod: `InboxItemIdBodySchema { id }`. Retention constants `INBOX_READ_RETENTION_DAYS = 90`, `INBOX_MAX_AGE_DAYS = 365`. `SOCIAL_API` gains `inbox`, `inboxRead`, `inboxReadAll`, `inboxUnreadCount`.

### 2. Database (`0023_social_notifications.sql`)
- `social_notification (id uuid PK, recipient_id FK cascade, actor_id FK cascade, type text, subject_id text NOT NULL DEFAULT '', created_at, read_at null)`. Unique index `(recipient_id, type, actor_id, subject_id)` so a repeated event collapses in place (stable id); index `(recipient_id, created_at desc)`; partial index on `(recipient_id) WHERE read_at IS NULL` for the count.

### 3. Server (`apps/web/src/lib/social/inbox.ts`, `inbox-hooks.ts`)
- `createNotification(tx, { recipientId, actorId, type, subjectId })`: upsert on the unique key, resets `created_at` and `read_at`, keeps the id. `deleteNotificationsForSubject(tx, type, subjectId)`, `deleteNotificationsBetween(tx, a, b)`.
- `listInbox(userId, cursor, limit)`: opportunistic bounded delete of the recipient's expired rows (read > 90 d ago, or created > 365 d ago), then select newest first with keyset cursor `(created_at, id)`, joined live to actor identity (handle, name, avatar; hidden if banned or handle-less), filtered by no block either way, and for `friend_request_received` joined to the live request row to derive `state` (missing or expired → gone; pending → pending; accepted / declined). Expired-request items are deleted in the same call.
- `unreadCount(userId)`: same filters, count only. `markRead(userId, id)` filters on recipient (foreign id = no-op), `markAllRead(userId)`.
- `inbox-hooks.ts` registers into `socialHooks` (imported for its side effect by `friends.ts` and `invite.ts`, which emit the events): `onRequestCreated` → received item for the addressee; `onRequestRemoved` accepted → delete the received item, create an accepted item for the requester (mutual auto-accept yields exactly one per side); declined / cancelled / blocked → delete the received item; new `onBlock(tx, blocker, blocked)` hook (fired in `blockWithin`) → delete all items between the pair; new `onInviteRedeemed(tx, ownerId, redeemerId)` hook (fired in `redeemInvite`) → `friend_joined_via_invite` for the owner. Cooldown re-requests fire no hook, so the recipient gets nothing.
- Routes (`cors` + `requireAuth`): `inbox.ts` GET `?cursor&limit`, `inbox-unread-count.ts` GET (own generous bucket, 120/min), `inbox-read.ts` POST `{ id }`, `inbox-read-all.ts` POST (30/min).

### 4. App
- `services/social/inbox.ts`: `useInbox` (infinite query), `useUnreadCount(enabled)`, `useMarkRead`, `useMarkAllRead` (update caches in place), keys `socialKeys.inbox`, `socialKeys.unread` under the `social` prefix (covered by `clearSocialQueries`). `invalidateUnreadCount()` exported from `services/social/cache.ts`, called from `sync-context.tsx` after every successful `fullSync()`.
- Badge: `useNavBadges()` in `nav-items.ts` returns `{ "/tabs/social": count }` from `useUnreadCount(isLoggedIn && SYNC_ENABLED)`, undefined on error or zero; TabBar already caps at 99+. `useRefetchSocialOnForeground()` moves into `useNavBadges` so the badge refreshes on foreground on both builds.
- `pages/social/inbox.tsx` + route `routes/tabs/social/inbox.tsx`: behind `SocialGate`; list with actor row and copy per type, unread dot, inline Accept / Decline for pending requests (calls the TASK-171.2 respond endpoint; `not_found` treated as resolved), state text for accepted / declined / gone, tapping marks read, "Mark all read" header action, load-more, empty ("Nothing here yet"), spinner, offline/error with retry keeping the cached list; unknown types render a generic "Something happened" row. The Social tab's "Inbox" placeholder row becomes a link with the unread count.

### 5. Deletion, docs, tests
- Cascade FKs cover deletion; `account-deletion.integration.test.ts` adds notification rows as recipient and as actor.
- Privacy: paragraph on social notifications and retention. `CONTEXT.md`: Inbox.
- `inbox.integration.test.ts` (buddy-read eligibility mocked): request creates unread item in the same transaction (request rejected → no item), repeat request collapses (same id), cancel removes, decline silent, accept creates the sender's item, mutual auto-accept one per side, invite redemption item for the owner, block deletes both directions and unblock does not restore, block filter on list and count, actor hidden when banned, mark-read authorisation, mark-all, listing order and cursor, retention cleanup (rows with old timestamps disappear from list and count and are deleted).
- Type-check + suites: core, web (throwaway migrated DB), capacitor.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cross-task contracts (from the final review of the TASK-171 set):
- **Deletion mechanism (decided):** the notifications table references `user.id` with `onDelete: "cascade"` on both the recipient and the actor column. TASK-171.1 has already switched `deleteAdminUser` to `deleteUserAccount`, so all three deletion paths are covered with no purge code.
- **One create function.** All inserts go through a single exported `createNotification(tx, …)` (and a matching delete or void function) that takes the caller's transaction. Event handlers never insert rows directly. TASK-171.11 hooks its push outbox write into this function. When a repeated event collapses into an existing item, keep the item id stable (update in place) so a pending outbox row stays valid.
- **Friend-request rules.** Register into TASK-171.2's transaction hooks. A request re-sent during the 90-day decline cooldown creates no item for the recipient. Cancel and expiry remove the item.
- **Generic item state.** Actionable items resolve their state live from the subject row (pending, accepted, declined, gone), and the type registry lets a type declare a void or expired state computed from the subject. Later types rely on this: buddy-read invites void on cancel, block, unfriend, the read ending or 30-day expiry (TASK-171.8); share offers expire after 30 days or show as no longer available (TASK-171.7); race invites expire when the 2-minute lobby closes (TASK-171.12). Expired or void items render without actions, as in AC #7.
- **Types added later, each by its own subtask:** share received, share accepted and shared book removed (TASK-171.7); statement of reasons and notice decision for in-app reporters (TASK-171.6); buddy-read invite, joined and finished (TASK-171.8); reply and reaction (TASK-171.9); race invite (TASK-171.12). Leave room next to the type set for TASK-171.11's type-to-category mapping. A declined share or buddy-read invite creates nothing for the sender or host.
- **Client plumbing.** Use TASK-171.1's shared authed-fetch helper, TASK-171.3's social query key prefix, refresh rules and social-cache clear, and TASK-171.3's `NavTarget` badge slot. The earlier notes about creating these "if TASK-171.3 did not" are resolved: they already exist.

Invite redemption event: the invite link is the main way to connect (no handle search), so TASK-171.2's invite-redemption hook also creates a 'friend joined via your invite' item for the link owner, in the same transaction as the friendship. The redeemer gets no item (they are on the confirmation screen).

Hook registration: `friends.ts` imports `./inbox-hooks` for its side effect, so the inbox listens before the first event fires regardless of which route module loaded first. Two hooks were added to the registry for this: `onMutualRequest` (the auto-accept path stores no request row for the second sender, so the accepted item for that side needs its own event) and `onBlock` (fires on every new block, even without a prior friendship or request) and `onInviteRedeemed`.

Query pitfalls found while testing: `read_at < cutoff` is NULL for unread rows and `NOT (…)` then hides them, so the retention predicate spells out `read_at IS NOT NULL`; a keyset cursor written as raw `sql` with a Date parameter loses drizzle's timestamp mapping (node-postgres sends local time with offset into a `timestamp` column), so the cursor uses `lt`/`eq` on the columns instead.

The account-deletion test used a global user count as its isolation check; with four DB test files creating users in parallel that became racy, so it now checks the other party survives. Migration 0023 applied to the dev DB. UI not exercised in a browser or on a device.

Correction: the privacy paragraph and the CONTEXT.md Inbox entry were reported as written but the script that wrote them had aborted earlier; both were added while finishing TASK-171.5.

## Review pass (combined with 171.5; five sonnet reviewers, every claim verified by hand)

Confirmed and fixed:
- AC #7 was unreachable: `inbox-hooks.ts` deleted the recipient's `friend_request_received` item on every resolution, so the `accepted` and `declined` item states never surfaced. Now a cancel or block deletes the item, while an accept or decline marks it read (`markSubjectRead`) and the state is derived live. Liveness is one SQL predicate (`liveRequestItem`): the request is pending and unexpired, or declined and still on record, or the pair are friends. It is used by `listInbox`, `unreadCount` and `purgeExpired`, which removed the duplicated raw-SQL rule in `unreadCount` and the post-filter delete in `listInbox`. `FriendRequestItemState` lost its unreachable `gone` member.
- The `onMutualRequest` hook is gone: the second sender's own received item (state `accepted`, read) is the record, so the extra `friend_request_accepted` item was a duplicate.
- `purgeExpired` now runs from `unreadCount` too, so retention holds for users who only ever load the badge.
- `GET /api/social/inbox` had no rate limit; now 120/min per user. `inbox-read-all` has its own bucket (30/min) instead of sharing `inbox-read`'s.
- Inbox screen: a failed background refetch with cached data and `navigator.onLine === true` showed nothing. New shared `StaleNotice` banner (also used by the Social tab) shows on error or offline and offers a retry.
- Privacy page: the released-handle paragraph claimed the hold keeps no link to the account; it keeps the owner so only they can reclaim it. Copy corrected. CONTEXT.md inbox entry describes the kept-versus-removed item rule.

Not changed: order-dependent inbox integration tests (sequential by design, noted), inline cleanup in account-deletion tests (per-run ids, no shared-state risk). Correctness reviewer found no defects.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## In-app social inbox

### What changed
- **Core**: `NOTIFICATION_TYPES` (`friend_request_received`, `friend_request_accepted`, `friend_joined_via_invite`) with the rules for later types in its doc comment, `InboxItem` / `InboxPage` / `UnreadCount` types (type carried as a string so old clients can skip unknown ones), `InboxItemIdBodySchema`, retention constants, `SOCIAL_API.inbox*` paths.
- **Database** (`0023_social_notifications.sql`): `social_notification` with cascade FKs on recipient and actor, unique `(recipient, type, actor, subject_id)` for in-place collapse, `(recipient, created_at)` index and a partial unread index.
- **Server** (`lib/social/inbox.ts`): `createNotification(tx, …)` (single write path, upsert keeps the id and marks unread again), `deleteNotificationsForSubject`, `deleteNotificationsBetween`, `listInbox` (opportunistic retention purge, keyset cursor, live actor identity, block filter, live friend-request state with gone items deleted), `unreadCount`, `markRead` (recipient-scoped), `markAllRead`. `inbox-hooks.ts` registers into the friend-graph hooks: received on request, accepted on accept and on mutual auto-accept (one per side), delete on decline / cancel / block, pair-wide delete on block, `friend_joined_via_invite` for the link owner. Routes: `inbox` GET (cursor, limit), `inbox-unread-count` GET (own 120/min bucket), `inbox-read` and `inbox-read-all` POST.
- **App**: `services/social/inbox.ts` (infinite query, unread count, mark read / all with cache updates) under the `social` key prefix (cleared with the rest); `useNavBadges` shows the unread count on the Social tab (hidden signed out, sync off, or on error) and refetches on foreground; `invalidateUnreadCount()` after every `fullSync`; `pages/social/inbox.tsx` (per-type copy, unread dot, inline Accept / Decline with already-resolved treated as success, tap to mark read, Mark all read, load more, empty / spinner / offline with cached list, unknown types rendered generically); the Social tab's inbox row links to it with the unread count.
- **Privacy**: inbox paragraph (contents, silent events, retention). **CONTEXT.md**: Inbox.

### Tests
- `inbox.integration.test.ts` (13): same-transaction creation and rejected request creating nothing, collapse and cancel, silent decline and cooldown re-request, accept item for the sender, remove creates nothing, mutual one per side, invite redemption item for the owner only, mark-read authorisation and mark-all, block deletes both ways / read-time filter / unblock restores nothing, banned actor hidden, ordering and cursor paging, retention purge, expired request dropped. Deletion test covers notification rows on both sides.
- Web suite 89 green on a fresh migrated DB; capacitor 673 green, type-check and lint clean.

### Follow-ups
- UI not run in a browser or on a device. Later features append their types to `NOTIFICATION_TYPES` and register into the hooks.
<!-- SECTION:FINAL_SUMMARY:END -->
