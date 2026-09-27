---
id: TASK-171.10
title: Friends activity feed
status: To Do
assignee: []
created_date: '2026-09-25 22:12'
updated_date: '2026-09-25 22:44'
labels:
  - social
  - web
  - app
milestone: m-6
dependencies:
  - TASK-171.5
parent_task_id: TASK-171
priority: medium
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
"See what friends are reading" (archived TASK-63). A chronological feed in the Social tab of friends' reading activity, respecting each friend's visibility settings.

Depends on TASK-171.5 (visibility resolver, per-book "hide from profile" flag, friends-only cover route) and, through it, TASK-171.1 (settings row), TASK-171.2 (friends/block/ban helpers) and TASK-171.3 (Social tab). TASK-61 later adds a shared-highlight event type on top of this task.

Scope:
- **Events (first cut)**: started a book, finished a book (with the rating if set; review text never). The event table and type-to-section mapping are extensible so TASK-61 can add a highlight type. Buddy-read events, streaks and milestones are not in this task.
- **Event generation**: derived server-side from synced state transitions, recorded as rows. Never fires for historic data (first sync of an existing library, a new device restoring, bulk imports); only for recent transitions.
- **Who appears**: only current accepted friends who are not blocked either way and not banned. Unfriending, blocking or a ban hides the actor's events immediately, past ones included. A new friend sees the actor's non-expired events from before the friendship, as they could on the profile. Users whose profile is `private` (the default) or whose relevant section is off show nothing.
- **Recording is minimised**: an event is recorded only while the actor's feed publishing is on and the mapped section is visible to friends at that moment; read-time checks still apply.
- **Feed UI**: Social tab home, newest first, infinite scroll. Each item: friend (avatar, display name), verb, cover, title, author, and the day only ("today", "yesterday", or a date), never a clock time, so the feed does not reveal when someone reads. The user's own events appear labelled "You". Tapping a book opens its Explore catalog page if it has a `catalogId`, else a small details sheet (cover, title, author); tapping the friend opens their profile.
- **States**: loading; offline (last fetched page from the query cache with an offline banner, delete disabled); error with retry; no friends yet (call to action to invite friends with an invite link, or to claim a handle first); friends but no visible activity (explains that friends' activity appears once they share it).
- **User controls**: delete an individual own event (overflow on own items). A "Share my reading activity in friends' feeds" switch, default on, is added by this task as a column on TASK-171.1's `social_profile` row and a switch on its visibility settings screens. Turning it off deletes all the user's existing events (the confirmation says so) and records nothing while off.
- **Retention**: events older than 90 days are not shown and are deleted.
- **Privacy policy** (`apps/web/src/routes/privacy/index.tsx`): feed events stored (book, type, day), who sees them, the 90-day retention, the publishing switch, deletion with the account.

Out of scope: likes/comments on feed items, non-friend/public feeds, recommendations, buddy-read and streak events, push (TASK-171.11).

Implementation notes:
- **Detecting transitions.** `POST /api/sync` (`apps/web/src/routes/api/sync.ts`) pushes a full snapshot as two batched upserts (`bookUpsertSet` / `bookUpsertSetPreservingMetadata`, `apps/web/src/lib/sync-book-upsert.ts`) in one transaction; there is no per-book diff. Read the stored state of the pushed `bookId`s (`status`, `word_position`, `word_count`, `finished_at`, `deleted`, `series_id`, `source`) before the upsert and compare with the merged result (e.g. `RETURNING`). Compare derived status via `bookStatus()` (`packages/core/src/books.ts`), because `status` NULL means "derive from progress". One extra query per push at most.
- **Transitions.** Started = derived status goes from `want` to `reading`. Finished = derived status becomes `finished`, or `finished_at` goes from NULL to a value. A unique index on `(actor, book_id, type)` gives at most one of each per book, so rereads, position resets and flapping do not re-emit. A deleted event is removed; a later transition may re-emit only if it passes the guards below.
- **Historic-sync guard.** (1) A book with no prior server row (INSERT) never emits. (2) Pulls never emit. (3) The app's startup `backfillFinishedAt` (`apps/capacitor/src/services/db/queries/books.ts`) fills historic finish dates, so emit `finished` only when the finish time (`finished_at`, or server time when absent) is within 72 hours of server `now()`. Never trust client `updated_at` as recency. (4) Builds older than `finished_at` send nothing for it (`COALESCE` keeps the stored value), so they reach finished only via derived status.
- **Excluded rows.** Web-serial chapters (`series_id` set) emit nothing in this first cut. Tombstoned rows emit nothing. Articles imported by URL (`source = 'url'`) emit nothing: they are short, numerous and reveal browsing (TASK-171.5 leaves them off profiles for the same reason).
- **Live join.** Store `(id, actor_user_id, book_id, type, created_at, payload)`; `payload` is empty for started/finished (reserved for TASK-61's highlight id), never positions or free text. Resolve title, author, `catalog_id`, rating and the hide flag at read time by joining `sync_books` on `(user_id, book_id)`, dropping missing or tombstoned rows, so book deletion, "Clear cloud data" (`clearCloudData`, `apps/web/src/lib/profile.ts`) and takedown tombstones (TASK-171.6, TASK-171.7) hide events without extra code.
- **Covers.** `sync_books.cover_image` is base64; never inline it. Use TASK-171.5's friends-only cover route, and the catalog cover proxy for rows with a `catalogId`.
- **Visibility.** Reuse TASK-171.5's resolver with relation = friend. Started maps to the currently-reading section, finished to finished books. A missing `social_profile` row means private defaults, so those users' events never show.
- **API.** `GET /api/social/feed` (cursor on `(created_at, id)`, not offset) and a `POST` to delete an own event (the `cors` middleware allows only GET, POST and OPTIONS), under `apps/web/src/routes/api/` with `middleware: [cors, requireAuth]` like `api/sync.ts`, called via TASK-171.1's authed-fetch helper with TASK-171.3's social query key prefix. `Cache-Control: private, no-store`. Rate-limit with `checkLimit` keyed `social-feed:${userId}`. The response is an explicit allowlist (no email, word position, review, notes, tags). Nothing goes into local SQLite; no app migration.
- **Retention.** `apps/web` has no scheduler: delete expired rows opportunistically with a bounded `DELETE ... WHERE created_at < cutoff` on feed reads, and filter by the cutoff on read.
- **Account deletion.** FK on the actor to `user.id` with `onDelete: "cascade"` covers all three deletion paths (see TASK-171). Schema in `apps/web/src/db/schema.ts`, migration in `apps/web/drizzle/`.
- **Transaction scope.** Insert events in a savepoint (nested `tx.transaction`), log and swallow its failure so a feed bug never blocks sync, with `ON CONFLICT DO NOTHING` for concurrent pushes from two devices.

Docs: document event types, the historic-sync guard, recording rules and retention in the developer docs; add "activity feed" and "feed event" to CONTEXT.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Starting and finishing a book creates feed events that the user's friends see in the Social tab when the matching profile section is visible to friends
- [ ] #2 Restoring or first-syncing an existing library, or importing books, does not create feed events
- [ ] #3 A released app build running its finished-date backfill for books finished long ago does not create finished events
- [ ] #4 Rereading a book, resetting its position, or two devices pushing the same transition creates no duplicate started or finished event
- [ ] #5 Web-serial chapters, articles imported by URL and tombstoned books never create feed events
- [ ] #6 No event is recorded while the actor's feed publishing is off or the mapped section is not visible to friends
- [ ] #7 Events for books hidden from profile, for sections the actor turned off, or from actors whose profile is private are never shown, including past events
- [ ] #8 Events for a book that was deleted, removed by Clear cloud data or taken down are no longer shown
- [ ] #9 Events are shown only from current friends: after unfriending, a block in either direction or a ban, the actor's events disappear from the viewer's feed
- [ ] #10 Feed items show the day of the event but never a clock time, and a finished event shows the rating but never review text
- [ ] #11 A user can delete an individual own event, and it no longer appears to anyone
- [ ] #12 The feed publishing switch defaults to on, and turning it off deletes the user's existing events after a confirmation that says so
- [ ] #13 The feed is paginated newest first with a stable cursor, labels the user's own events as You, and links to the friend's profile and the book (Explore page for catalog books, a details sheet otherwise)
- [ ] #14 The feed shows distinct loading, offline, error with retry, no-friends and no-activity states
- [ ] #15 The feed API works from the native app with a bearer token and from the web build with a session cookie, is rate-limited per user, returns only allowlisted fields, and responses are sent with Cache-Control private, no-store
- [ ] #16 Events older than 90 days are never shown and are removed
- [ ] #17 Deleting the account through any of the three deletion paths removes that user's feed events, verified in account-deletion.integration.test.ts
- [ ] #18 The privacy policy describes feed events, who sees them, the 90-day retention, the publishing switch and deletion with the account
- [ ] #19 Tests cover event generation on transitions, the historic-sync and backfill guards, deduplication, excluded rows, the recording rules, and visibility, relation and hide-flag filtering at read time
- [ ] #20 Developer docs describe the event types, the historic-sync guard, recording rules and retention, and CONTEXT.md defines activity feed and feed event
<!-- AC:END -->
