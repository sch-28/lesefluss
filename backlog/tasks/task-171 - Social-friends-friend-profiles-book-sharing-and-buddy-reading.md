---
id: TASK-171
title: 'Social: friends, friend profiles, book sharing and buddy reading'
status: To Do
assignee: []
created_date: '2026-09-25 22:09'
updated_date: '2026-09-28 16:17'
labels:
  - social
milestone: m-6
dependencies: []
documentation:
  - backlog/decisions/ADR-0004-friends-only-book-sharing.md
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
  - backlog/decisions/ADR-0003-chunked-content-and-sync-exclusion.md
  - CONTEXT.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Parent task for the social workstream. Today Lesefluss is single-player: every server table is keyed by one `userId`, there is no friend graph, no identity other people can see, and no way for two people to read the same book together.

Goal: readers can add friends, see each other's profiles and reading, share a book with a friend, and read a book together ("buddy read") with progress comparison and spoiler-safe discussion.

Key decisions (do not re-litigate; see ADR-0004):
- **Friendship is mutual** (request + accept), not follow. Everything social is visible to accepted friends only. There are no public profiles.
- **No discoverability.** There is no handle search, directory or suggestion list. People connect only through a personal invite link shared anywhere, or an in-app request to a co-participant in a shared buddy read (TASK-171.2).
- **Book sharing is 1:1 to an accepted friend, by server-side copy of the sender's `sync_books` row** into the recipient's account. No public links, no forwardable URLs, no sharing to non-friends. Only synced books (≤ `MAX_SYNCED_CONTENT_BYTES`, ADR-0003) can be shared. Private fields (position, status, rating, review, tags, notes, highlights, glossary, hide-from-profile flag) never travel.
- **Book identity for buddy reading is "content origin"**: the `(userId, bookId)` the content was first imported into, inherited by every copy. Same origin = identical content = word positions compare exactly (ADR-0002). No content hashing, no fuzzy matching.
- **Catalog books use the same sharing path.** Archived TASK-62 is subsumed.
- **Notice-and-takedown (EU DSA Art. 16/17) must be live before book sharing ships to users.**
- **Social UI lives in a new "Social" tab** in the app (capacitor, native + web build). Profiles render only there, for friends. The website only hosts the `/invite/<token>` fallback page and the public notice form.
- **No push notifications in the first cut.** An in-app inbox refreshed on app foreground and sync is enough; push via Firebase Cloud Messaging is the last roadmap item (TASK-171.11).

Supersedes archived TASK-60, TASK-62, TASK-63, TASK-64, TASK-65 and TASK-66. Absorbs TASK-61 (share highlights) and TASK-117 (share stats) as dependents of this workstream.

Work order: see the Roadmap in this task's Implementation Plan.

Cross-cutting requirements for every subtask:
- Server tables are Postgres via Drizzle in `apps/web/src/db/schema.ts`, with a generated migration in `apps/web/drizzle/` (latest today is `0020_book_added_at.sql`). The better-auth `user` table lives in `apps/web/src/db/auth-schema.ts`.
- **Account deletion** has three entry points, and all end by deleting the `user` row: `deleteUserAccount` in `apps/web/src/lib/account-deletion.ts` (website account page, via `lib/profile.ts`; calls `purgeUserSyncData`), better-auth's `user.deleteUser.afterDelete` in `apps/web/src/lib/auth.ts` (calls only `purgeUserSyncData`), and `deleteAdminUser` in `apps/web/src/lib/admin.ts`, which today runs its own inline deletes and skips glossary entries and reading sessions. **TASK-171.1 switches `deleteAdminUser` to `deleteUserAccount`**, so afterwards every path reaches `purgeUserSyncData`. Purge rows the user owns and rows in which they are the other party. Extend `account-deletion.integration.test.ts` for every new table.
- **Purge mechanism**: a social table whose rows mean nothing without the user (profile, friendships, requests, blocks, invites, inbox, feed events, share records, buddy-read memberships, push tokens) references `user.id` with `onDelete: "cascade"` (or `"set null"` where a row must outlive the user) on every user column. Purges that a cascade cannot express (anonymising, host handover) go in `purgeUserSyncData` or a function it calls. Each subtask states which it uses. Sync tables keep their no-FK convention.
- **Clear cloud data** (`clearCloudData` in `apps/web/src/lib/profile.ts`) hard-deletes a user's `sync_books`, `sync_highlights`, `sync_glossary_entries` and `sync_settings` rows without deleting the account, and devices then push the same ids back. Social data keyed to sync rows must handle it: identity, friendships and settings survive it; server-created copies keep their origin (TASK-171.7 copy record); taken-down books stay removed (TASK-171.6 removal record).
- **Deliberate survivors**: content-origin columns on `sync_books` have no FK, so a recipient keeps their copy when the origin owner deletes their account. Moderation records from TASK-171.6 (notices, removal records) have no FK because they are kept for their retention period as a legal record; deletion strips the user's name and email from them.
- **Endpoints** the app calls are TanStack Start file routes under `apps/web/src/routes/api/` with `middleware: [cors, requireAuth]` (`~/lib/cors-middleware`, `~/lib/session-middleware`), like `api/sync.ts`. `requireAuth` accepts the cookie (web build) and the bearer token (native, better-auth `bearer()`). `createServerFn` functions (`lib/profile.ts`, `lib/admin.ts`) serve only the website. `cors` allows only `GET, POST, OPTIONS` and the headers `Content-Type, Authorization, X-Sync-Have`: use POST for every mutation, or extend `cors-middleware.ts` in the subtask that needs more. GET never changes state.
- **Client auth**: `syncFetch` in `apps/capacitor/src/services/sync/index.ts` is module-private. TASK-171.1 extracts it into a shared authed-fetch helper (bearer on native, `credentials: "include"` on the web build, same 401 handling); every later subtask uses that helper.
- **Rate limits**: `checkLimit` from `apps/web/src/lib/rate-limit.ts`, keyed by user id (e.g. `social-request:${userId}`). It is in-memory per process; caps that must hold across instances are counted in Postgres.
- **Visibility gate**: anything user-visible about another person is gated server-side through TASK-171.2's helpers: a "no block either way, neither banned" check, and a "friends" check built on it. Friend-scoped features use both; buddy-read member-to-member visibility (TASK-171.8, TASK-171.9) uses only the first. A blocked user sees the blocker as not found everywhere. Unfriending or blocking stops future interaction only; books already delivered stay with the recipient. Never expose `user.email`; `user.name` and `user.image` appear socially only when the user chooses them (TASK-171.1).
- Social features require a signed-in account with a handle; signed-out users get an explanation and a sign-in entry point (TASK-171.3).
- Social state is fetched with TanStack Query, not written to local SQLite, unless a subtask needs offline data (then a migration in `apps/capacitor/drizzle/`, latest `0032_metadata_updated_at.sql`). Social queries override the shared `queryClient` defaults (`staleTime: Infinity`) and are cleared on sign-out and account switch through TASK-171.3's social-cache clear.
- **Rollout**: older app builds stay in the wild with no Social tab and no min-version gate. Additions to the sync payload are optional in `packages/core/src/sync.ts` (like `finishedAt` and `addedAt`), and server-only columns are never overwritten by a client push.
- Privacy policy and terms (`apps/web/src/routes/privacy/index.tsx`, `apps/web/src/routes/terms/index.tsx`) are updated by the subtask that introduces a category of shared data. New domain terms go into `CONTEXT.md` in the subtask that introduces them.
- Shared stats logic (reading-rate plausibility, measured reading speed, session credit throttle) lives once in `@lesefluss/core`; TASK-171.5 moves the aggregate pieces, TASK-171.12 the session-tracker throttle, and TASK-117 and TASK-160 reuse them.

Integration points for book sharing (TASK-171.7) and takedown (TASK-171.6), verified against the code:
- A copied row needs a new `bookId` matching `SyncBookSchema`'s `^[0-9a-f]{8}$`, unique within the recipient's `(user_id, book_id)` key; retry on collision in the transaction. The pull (`pullSync` → `addServerBookWithContent`) materialises it; the copy has `content` set, `deleted = false`, fresh `updatedAt`/`metadataUpdatedAt` and `wordPosition = 0`.
- Content-origin columns are server-only. `bookInsertValues` in `apps/web/src/lib/sync-book-upsert.ts` sets them to the inserted row's own `(userId, bookId)` (or the copy record's origin, TASK-171.7), never from the payload; `bookUpsertSet` and `bookUpsertSetPreservingMetadata` never reference them. The migration backfills existing rows the same way.
- Takedown tombstones rows the way `deleteAdminBook` in `lib/admin.ts` does. `hardDeleteAdminTombstones` and `clearCloudData` remove rows, after which an offline device could push the book back, so TASK-171.6 keeps a removal record that the sync push checks.
- Admin functions are gated by `requireAdminSession()` in `lib/admin.ts`. A better-auth ban (`user.banned`) blocks sign-in and sync, so sharing suspension uses its own restriction record (TASK-171.6).
- Word positions from two copies compare exactly only if both devices apply the same `WordIndex` rule (ADR-0002). TASK-171.8 detects skew by comparing participants' `word_count` for the same origin.

Routing: the website already has `/profile` (`routes/_authenticated/profile`, the private account and stats page) and serves the app's web build under `/app`. Invites use `/invite/<token>`. Profiles and shares have no URLs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All subtasks are Done, or explicitly descoped with a note on this task
- [x] #2 ADR-0004 is Accepted and milestone m-6 reflects the friends-only sharing rule
- [ ] #3 Book sharing and highlight sharing are not enabled for users in production until the reporting and takedown subtask (TASK-171.6) is Done
- [ ] #4 No social endpoint lets a user find another user by handle, name or email, and no profile data is reachable without an accepted friendship
- [ ] #5 Deleting an account (every path goes through deleteUserAccount: the website account page and the admin deleteAdminUser action; better-auth's /delete-user and /admin/remove-user are disabled) removes every social row the user owns and every social row that references them, except moderation records kept for their retention period with the user's name and email removed, verified by account-deletion.integration.test.ts
- [x] #6 A recipient's shared copy survives the sender's account deletion, unfriending and blocking, verified by an integration test
- [x] #7 CONTEXT.md defines friend, handle, share, content origin and buddy read
- [x] #8 The privacy policy describes every social data category (who can see it, retention, deletion with the account) before that category is enabled in production
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Roadmap

Work top to bottom. Each task's dependency field is the source of truth; this is the readable version of it. "Parallel" means the tasks can be worked on at the same time by different people or agents.

### Phase 1: Foundation (sequential)
1. **TASK-171.1** Social identity: handle (display only, not searchable), profile fields, private/friends visibility. Also extracts the shared authed-fetch helper and switches `deleteAdminUser` to `deleteUserAccount`, which every later task relies on.
2. **TASK-171.2** Friendships: invite links, request to a buddy-read co-participant (stubbed until TASK-171.8), accept/decline, remove, block, and the visibility helpers every later endpoint uses.
3. **TASK-171.3** Social tab in the app and the `/invite/<token>` deep link.

### Phase 2: Inbox and profiles (parallel)
4. **TASK-171.4** In-app inbox, the single notification pipeline later tasks add types to.
5. **TASK-171.5** Friend profiles in the app (per-book "hide from profile" flag, shared stats code in core).

Milestone after phase 2: friends connect via invite link, get notified, and see each other's profiles. Shippable on its own.

### Phase 3: Reporting and takedown
6. **TASK-171.6** Reporting and notice-and-takedown. **Gate: must be Done before book sharing or highlight sharing ships to users.**

### Phase 4: Book sharing
7. **TASK-171.7** Share a book with a friend (server-side copy, content origin, takedown of copies).

### Phase 5: Buddy reading (sequential)
8. **TASK-171.8** Buddy reads with progress comparison, reader markers, and "Add friend"/"Block" on co-participants (replaces TASK-171.2's stub check).
9. **TASK-171.9** Buddy-read discussion: spoiler-gated comments, shared highlights, reactions.

Milestone after phase 5: the headline feature is complete.

### Phase 6: Social extras (parallel with phases 3-5)
10. **TASK-171.10** Friends activity feed (needs TASK-171.5).
11. **TASK-117** Share reading stats with friends, plus stats card (needs TASK-171.5).
12. **TASK-61** Share highlights with friends, plus quote cards (needs TASK-171.10 and TASK-171.6).

### Phase 7: Later (low priority)
13. **TASK-171.15** Live board in buddy reads: live positions, reading-now and speed on the reader's progress bar. It replaced the reading races of TASK-171.12, which were built, dropped by the owner and archived without shipping.
14. **TASK-171.11** Push notifications via Firebase Cloud Messaging. Deliberately last: every event already reaches the inbox, and push is only a second delivery channel.

### Critical path
TASK-171.1 → 171.2 → 171.3 → 171.5 → 171.6 → 171.7 → 171.8 → 171.9. TASK-171.4 runs next to 171.5 and must be Done before 171.6.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Checkpoint 2026-09-27: on-device test of 171.1 to 171.7 (Pixel 8 Pro, debug build)

Setup: fully migrated throwaway database `lesefluss_phone` with two seeded users, web dev server on `localhost:3000` reached from the phone through `adb reverse`, debug-only manifest overlay `android/app/src/debug/AndroidManifest.xml` allowing cleartext, app built with `VITE_SYNC_URL=http://localhost:3000`. The local dev database is behind the schema (missing `word_position`), so the first sync against it returned a 500; not a code defect.

Verified on the phone: sign-in handoff and deep link, handle claim with live availability check, Social tab, invite link creation, friend added through invite redemption (badge and inbox item), inbox mark-read, friend profile with bio, friend count, currently-reading card with catalog cover and stats, report flow from the profile menu (notice stored with snapshot), settings page with preview-as-friend, library sync, book detail Share action, first-share rights confirmation, share created and listed as "Waiting", incoming share item with book card, Add to library creating the copy on the device after sync, share-accepted item, block from the friend menu (friend list, blocked list, other side gets not_found, pair items removed), unblock. On the web: admin notices queue, decision with statement of reasons (bio removed, decision item for the reporter), actioned view with failed-mail state and Resend, public /report form inline validation.

Fixed during the checkpoint: a 401 that cleared the token left `isLoggedIn` true, so the Social tab showed "Can't reach the server" instead of the sign-in state (new `onSessionLost` in session.ts, subscribed in the sync context); the contest sentence said "replying to this email" inside inbox items (now channel-neutral, naming notices@lesefluss.app); accepted share items lost their cover. Mail sending fails in dev (dummy Resend key) and is recorded as such.

## Corrections after the branch review (2026-09-28)
- **Account deletion paths.** The description's "three entry points" is out of date. `apps/web/src/lib/auth.ts` sets `disabledPaths: ["/delete-user", "/admin/remove-user"]` (TASK-171.13), and there is no `beforeDelete`/`afterDelete` hook. Every deletion goes through `deleteUserAccount`: the website account page (`lib/profile.ts`) and the admin `deleteAdminUser` (`lib/admin.ts`). AC #5 is reworded to match. There is no test for the admin path yet (TASK-175.4).
- **Session-tracker throttle.** The cross-cutting note names TASK-171.12 for the credit throttle. It lives in `packages/core/src/reading-credit.ts`, which TASK-171.15 kept when TASK-171.12 was archived.
- **ACs checked after verification:**
  - #2: ADR-0004 is Accepted, and the m-6 milestone description states the friends-only 1:1 sharing rule.
  - #6: `shares.integration.test.ts` covers "a copy survives unfriending, blocking and the sender's account deletion".
  - #7: CONTEXT.md has Friend, Handle, Share, Content origin and Buddy read.
  - #8: the privacy policy has sections for the social profile, friends and invite links, the inbox, what friends see, sharing books, buddy reads, comments and shared highlights, live reading activity, the activity feed, and notices.
- **Left open:**
  - #1: TASK-171.11, TASK-117, TASK-61 and TASK-175 are open.
  - #3: needs production knowledge.
  - #4: not re-audited in this pass.
<!-- SECTION:NOTES:END -->
