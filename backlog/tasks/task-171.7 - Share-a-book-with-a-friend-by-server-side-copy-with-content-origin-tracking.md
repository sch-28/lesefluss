---
id: TASK-171.7
title: Share a book with a friend by server-side copy with content origin tracking
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 22:11'
updated_date: '2026-10-02 16:58'
labels:
  - social
  - web
  - app
  - sync
dependencies:
  - TASK-171.2
  - TASK-171.3
  - TASK-171.4
  - TASK-171.6
documentation:
  - backlog/decisions/ADR-0004-friends-only-book-sharing.md
  - backlog/decisions/ADR-0003-chunked-content-and-sync-exclusion.md
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
parent_task_id: TASK-171
priority: high
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A user sends a book from their library to one accepted friend, who gets an identical copy in their own library. This is the mechanism that guarantees identical content for buddy reading (ADR-0004). Subsumes archived TASK-62 (catalog books use the same path).

Depends on TASK-171.2 (friends helper, remove/block hooks), TASK-171.3 (Social tab), TASK-171.4 (inbox), TASK-171.6 (report flow, `takeDownBooks`, `isSharingSuspended`, `isOriginTakenDown`, removal records). Uses the identity card from TASK-171.1. Shares have no URLs; the inbox is the entry point. **Must not be enabled for users in production before TASK-171.6 is Done.**

Scope:
- **Content origin**: add `origin_user_id`, `origin_book_id` to `sync_books`, NOT NULL, indexed, no FK to `user`. Existing rows are backfilled and new rows default to their own `(user_id, book_id)`. A copy inherits the source row's origin (a copy of a copy keeps the first origin). Origin is server-authoritative; a push can never set or change it. Clients never receive the raw origin user id: pull returns an opaque `originKey` (see notes), stored in a new column on the local `books` table (`apps/capacitor/src/services/db/schema.ts`, migration in `apps/capacitor/drizzle/`). Buddy-read matching happens server-side on the origin columns.
- **Copy record**: every server-created copy (share accept here, buddy-read join in TASK-171.8) writes a row `(user_id, book_id, origin_user_id, origin_book_id)` in a server-only table that "Clear cloud data" does not touch. When a push inserts a row whose `(user_id, book_id)` has a copy record, the insert takes the recorded origin instead of defaulting to its own ids, so a copy keeps its origin after `clearCloudData` and a re-push.
- **Create share**: from the book detail page (`apps/capacitor/src/pages/library/book-detail.tsx`) pick one friend. Allowed only when: the two are friends and not blocked; the sender's sharing is not suspended; the server row exists with `content IS NOT NULL`, `deleted = false`, `series_id IS NULL` (checked server-side; `isSyncEligible` alone only checks size); its origin is not taken down. The client shows why sharing is unavailable for local-only books, books not pushed yet and series chapters.
- **Sender UX**: the picker lists accepted friends only (identity card); with no friends it links to the Social tab. Signed out or `SYNC_ENABLED` off: no share action. Offline or server error: an error with retry, nothing queued. The book detail page lists open shares ("Waiting for @handle") with revoke.
- **Pending share**: a share record (sender, recipient, source book, origin, status pending/accepted/declined/expired/revoked, timestamps). The recipient's inbox item (type "share received") shows title, author, cover, word count and the sender's identity card, with accept, decline and Report (TASK-171.6 flow; target type "received share", snapshot: sender, title, author, origin). Pending shares expire after 30 days. If the sender deleted the source book, has since been suspended, or the origin was taken down, the item shows "no longer available" without saying why and accept is refused. Removing a friend or blocking either way revokes pending shares between the two (TASK-171.2 hook). At most one pending share per sender, recipient and origin.
- **Accept**: re-checks friendship, block, suspension and takedown, then copies the source row into the recipient's `sync_books` in one transaction with a fresh server-generated `bookId` (8-char hex per `SyncBookSchema`, unique in the recipient's account) and writes the copy record. Copied: content, cover image, chapters, link ranges, title, author, description, language, source, catalogId, file size, word count. Not copied: `sourceUrl`, word position (0), status, rating, review, tags, finishedAt, notes, highlights, glossary, reading sessions, series membership, hide-from-profile flag (the copy starts visible). `addedAt`, `updatedAt`, `metadataUpdatedAt` = accept time. The pull materialises it via `addServerBookWithContent`; the app syncs right after accept. The sender gets a "share accepted" item.
- **Duplicate handling**: if the recipient already has a non-deleted book with the same origin (including their own original shared back), accept links to it instead of copying.
- **Decline**: silent, no item for the sender, who sees "waiting" until the 30-day expiry, then "not accepted"; a new share of that origin to that recipient is refused until then.
- **After accept** the copy belongs to the recipient: unfriending, blocking or the sender deleting their account never removes it. Only takedown does.
- **Takedown for shares** (extends TASK-171.6): the admin action on a received-share notice offers "this copy" or "every copy of this origin". The origin scope finds copies through the `sync_books` origin columns (not share records, which account deletion purges), skips the origin row itself, and calls `takeDownBooks` with scope `origin`. Both scopes revoke pending shares of the removed content, and each recipient whose copy was removed gets a neutral "shared book removed" inbox item. The statement of reasons goes to the sender of the reported share.
- **Limits**: 20 shares per sender per rolling 24 hours, counted in Postgres. Storage counts against the recipient (TASK-123 quota, when it lands).
- **Terms / privacy**: on first share the sender confirms they have the right to share the book with this friend (checkbox, recorded once server-side with a timestamp). Privacy policy: content and metadata are copied to the recipient's account and stay there; share records and retention. Terms: the sharing rule. Add "share" and "content origin" to `CONTEXT.md`.

Out of scope: sharing to several friends at once (buddy read handles groups), series/web-novel chapters, highlights (TASK-61), pushing link ranges from the client (an existing gap: `bookInsertValues` and both upsert sets drop `link_ranges`; track separately).

Implementation notes (verified against the code):
- **Insert paths**: `bookInsertValues` (`apps/web/src/lib/sync-book-upsert.ts`) and `buildRow`/`insertSyncBook` (`apps/web/src/lib/article-import.ts`) set origin from the row's own ids or its copy record, never from the payload. `bookUpsertSet` and `bookUpsertSetPreservingMetadata` must not reference origin. Add columns nullable, backfill, then set NOT NULL, in one migration; time it on a production-sized copy.
- **Origin key**: `originKey` = HMAC-SHA256 of `origin_user_id:origin_book_id` with a dedicated server secret, hex, computed on every pull. Add it to `metadataCols` output in `getUserSyncData` (`apps/web/src/routes/api/sync.ts`) and as optional on `SyncResponse` only; the push schema never accepts it.
- **Client storage**: map `originKey` in `buildBookRowFromServer` and write it outside the revision gate in `buildBookMergeUpdate` (like `finishedAt` in `pullSync`), so existing books get it and a rotated secret self-heals. Offline imports have no key until push and pull; treat missing as "unknown".
- **Link ranges**: add `link_ranges` to `getUserSyncData`'s content query so copies deliver them.
- **Copy in SQL**: `INSERT INTO sync_books (...) SELECT ... WHERE user_id = sender AND book_id = source AND NOT deleted AND content IS NOT NULL AND series_id IS NULL`, so content never round-trips through Node. Zero rows means the source is gone. `generateBookId` with conflict retry, as `article-import.ts` does. Expose it as one function TASK-171.8 reuses.
- **Concurrency**: pending to accepted with `WHERE status = 'pending'`; partial unique index on `(user_id, origin_user_id, origin_book_id) WHERE NOT deleted` backs duplicate linking.
- **Tombstones**: push never tombstones books missing from a snapshot. A deleted copy stays a sticky tombstone; a later share creates a new `bookId`.
- **Endpoints**: create/revoke/accept/decline/list are file routes under `apps/web/src/routes/api/` with `middleware: [cors, requireAuth]`, all POST except list, via TASK-171.1's authed-fetch helper. Post-accept sync: `syncNow` from `useSyncContext`. Burst-limit with `checkLimit` (`share:${userId}`); the daily cap comes from share rows.
- **Expiry and retention**: no job runner; treat pending older than 30 days as expired on read and accept. Delete declined, expired and revoked records older than 90 days lazily when the sender creates a share.
- **Account deletion**: share records (sender and recipient columns), copy records and the first-share confirmation reference `user.id` with `onDelete: "cascade"`. Recipient copies stay. Extend `account-deletion.integration.test.ts`.
- **Tests**: extend `sync-book-upsert.integration.test.ts` for origin defaulting, copy-record origin and push immunity; add Postgres integration tests for the share flow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every sync_books row has a non-null origin; existing rows are backfilled to their own (user_id, book_id), and rows created by sync push or server-side article import get their own (user_id, book_id)
- [x] #2 A sync push that carries origin fields, or that updates an existing copy, does not set or change origin
- [x] #3 Pull returns an opaque origin key, never the origin owner's user id; equal origins give equal keys, and the key is stored locally on the book row, including for books already on the device before this change
- [x] #4 After Clear cloud data and a re-push from the recipient's device, a received copy has the same origin it had before
- [x] #5 A signed-in user can share a synced book with one accepted friend from the book detail page; the picker lists only accepted friends and, with no friends, links to the Social tab
- [x] #6 Sharing is refused for non-friends, blocked users, suspended senders, local-only books, books without server content, tombstoned books, series chapters and taken-down origins, each with a user-facing reason
- [x] #7 When offline or on a server error the share action shows an error with retry and queues nothing; signed-out users and builds without sync see no share action
- [x] #8 The recipient gets an inbox item with title, author, cover, word count and the sender's identity card, and can accept, decline or report it through the TASK-171.6 flow
- [x] #9 A pending share whose sender was suspended, whose source book was deleted or whose origin was taken down shows as no longer available without a reason and cannot be accepted
- [x] #10 The sender sees open shares on the book detail page and can revoke them while pending; pending shares expire after 30 days
- [x] #11 Declining creates nothing for the sender, who sees the share as waiting until expiry; re-sharing the same origin to the same recipient while a share is pending or declined-but-unexpired is refused
- [x] #12 Unfriending or blocking revokes pending shares between the two users, and accept re-checks friendship, block, suspension and takedown
- [x] #13 Accepting creates a new book in the recipient's library with identical content, chapters, cover and link ranges, and the same origin as the source
- [x] #14 The recipient's copy has a new book ID, position 0 and none of the sender's source URL, position, status, rating, review, tags, notes, highlights, glossary, sessions or hide-from-profile flag
- [x] #15 The shared book appears on the recipient's device after accept without a manual sync, on native and web build, and the sender gets a share-accepted inbox item
- [x] #16 Accepting when the recipient already has a non-deleted book with the same origin does not create a duplicate, including when two accepts race
- [x] #17 A copy of a copy keeps the original origin
- [x] #18 An accepted copy stays in the recipient's library after unfriending, blocking or the sender's account deletion
- [x] #19 An admin can take down a reported share as this copy only or as every copy of its origin; the origin scope finds copies through the origin columns even after the sender's account deletion, never touches the origin row, and makes the origin refused for future shares
- [x] #20 A takedown revokes pending shares of the removed content, removed books disappear from recipients' devices on next sync, and each affected recipient gets a neutral shared-book-removed inbox item
- [x] #21 A sender can create at most 20 shares per rolling 24 hours, enforced from Postgres so the cap holds across server processes
- [x] #22 First share requires the sender to confirm they have the right to share, and this is recorded server-side with a timestamp
- [x] #23 Deleting an account through any of the three paths purges the user's share records, copy records and first-share confirmation as sender and as recipient; declined, expired and revoked share records older than 90 days are deleted
- [x] #24 Privacy policy (what is copied, that it stays with the recipient, share record retention), terms (sharing rule) and CONTEXT.md (share, content origin) are updated
- [x] #25 Integration tests against Postgres cover origin defaulting, copy-record origin and push immunity, accept copy fields, origin inheritance, duplicate linking, revoke, decline, expiry, unfriend and block revocation, the daily cap, account deletion, copy survival and both takedown scopes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation plan

### 1. Core (`packages/core/src/`)
- `sync.ts`: `SyncResponse.books` becomes `SyncResponseBook[]` = `SyncBook & { originKey?: string; linkRanges? }`; the push schema is unchanged (an `originKey` in a payload is ignored by Zod's default stripping).
- `social.ts`: `SOCIAL_API.share`, `shareRevoke`, `shareRespond`, `sharesForBook`; `ShareBodySchema { recipientId, bookId, confirmRights?: boolean }`, `ShareIdBodySchema`, `ShareRespondBodySchema { shareId, action: accept | decline }`; `SHARE_TTL_DAYS = 30`, `SHARE_DAILY_LIMIT = 20`, `SHARE_RECORD_RETENTION_DAYS = 90`; `OutgoingShare { shareId, recipient: SocialIdentity, state: pending | expired, createdAt }`; inbox types `share_received`, `share_accepted`, `share_removed`; `InboxItem.subject` union gains `{ kind: "share"; shareId; state: pending | accepted | declined | unavailable; book: { title, author, wordCount, cover: ProfileCover } }`; `ShareErrorCode` copy for `consent_required`, `not_shareable`, `already_shared`, `suspended`, `unavailable`, `limit_reached`.

### 2. Database (`0026_shares.sql`)
- `sync_books.origin_user_id`, `origin_book_id`: added nullable, backfilled to `(user_id, book_id)`, then `NOT NULL`; index `(origin_user_id, origin_book_id)`; partial unique index `(user_id, origin_user_id, origin_book_id) WHERE NOT deleted` (backs duplicate linking and the accept race).
- `sync_book_copy` (server-only, untouched by Clear cloud data): PK `(user_id, book_id)`, `user_id` FK cascade, `origin_user_id`, `origin_book_id`, `via` (`share` | `buddy_read`), `created_at`.
- `social_share`: id, `sender_id` and `recipient_id` FK cascade, `book_id` (sender's row), `origin_user_id`, `origin_book_id`, status (`pending` | `accepted` | `declined` | `expired` | `revoked`), `copy_book_id`, `created_at`, `resolved_at`; indexes `(recipient_id, status)`, `(sender_id, created_at)`; partial unique `(sender_id, recipient_id, origin_user_id, origin_book_id) WHERE status = 'pending'`.
- `social_share_consent`: `user_id` PK FK cascade, `confirmed_at`.
- Capacitor `0034_origin_key.sql`: `books.origin_key text`.

### 3. Origin on the server
- `lib/origin.ts`: `originKey(originUserId, originBookId)` = HMAC-SHA256 hex with `ORIGIN_KEY_SECRET` (falls back to a key derived from `BETTER_AUTH_SECRET` so no deploy step is needed; documented).
- `bookInsertValues(userId, book, origin?)` sets `originUserId`/`originBookId` from the copy record when given, else own ids; neither upsert set references origin, so an update never changes it. The push loads `sync_book_copy` rows for the pushed ids once per request and passes them in. `article-import.ts` `buildRow` sets own ids.
- `getUserSyncData`: `originKey` on every book (from the origin columns), `linkRanges` added to the content query and the response.
- `lib/social/copy-book.ts`: `copyBookForUser(tx, { sourceUserId, sourceBookId, recipientId, via, now })` → `{ bookId, created }`: links to the recipient's existing non-deleted row with the same origin when there is one; otherwise `INSERT … SELECT` (content, cover, chapters, link ranges, title, author, description, language, source, catalogId, file size, word count; position 0, no sourceUrl / status / rating / review / tags / finishedAt / series / hide flag; `addedAt`, `updatedAt`, `metadataUpdatedAt` = now; origin inherited from the source row) with `generateBookId` and one retry on PK conflict, a `sync_book_copy` row, and the partial unique index turning a racing duplicate into a link. Zero rows selected = source gone (`unavailable`). TASK-171.8 reuses it.

### 4. Shares (`lib/social/shares.ts`, hooks in `share-hooks.ts`)
- `createShare(senderId, body, now)`: lazy purge of the sender's resolved records older than 90 days; consent (first share needs `confirmRights: true`, recorded once with a timestamp, else `consent_required`); `areFriends`; `isSharingSuspended` → `suspended`; source row live with content and no series and origin not taken down → else `not_shareable`; no pending or declined-unexpired share for the same recipient and origin → else `already_shared`; fewer than 20 shares created in the last 24 h (Postgres count) → else `limit_reached`. Inserts the share and a `share_received` inbox item (subject = share id). Route adds a `share:${userId}` burst bucket.
- `listSharesForBook(senderId, bookId, now)`: pending and expired-pending with the recipient's identity, for the detail page. `revokeShare(senderId, shareId)`: pending → revoked, recipient's item deleted.
- `respondToShare(recipientId, shareId, action, now)`: pending and unexpired or `not_found`. Decline: `declined`, item marked read, nothing for the sender. Accept: re-checks friendship, block, suspension, takedown and source; `copyBookForUser`; `accepted` with `copy_book_id` (`WHERE status = 'pending'`); `share_accepted` item for the sender; recipient's item marked read. Failing re-checks → `unavailable`.
- `shareStatesFor(viewerId, shares, now)`: the live state per item (`pending` only while the source is live, the sender not suspended, the origin not taken down and the two still friends; otherwise `unavailable`; `accepted` / `declined` as stored) plus the book card (title, author, word count, cover via catalog id or a signed cover URL). `listInbox` calls it for `share_received` items; `unreadCount` counts them while the share row is not revoked (one more clause next to `liveRequestItem`).
- Hooks: `onFriendshipRemoved` and `onBlock` revoke pending shares between the pair and delete their items.
- Takedown (`moderation/takedown.ts`): `takeDownShared(tx, ref, scope, noticeId)`: scope `copy` removes the reported row; scope `origin` also removes every other row with that origin except the origin row itself (found through the origin columns, so it works after the sender's account deletion) with `takeDownBooks(…, "origin")`. Both revoke pending shares of the removed rows and origin, delete their items and give each affected recipient a `share_removed` item (actor null, neutral text). `DecideInput.scope`, admin UI scope picker for shared-book notices. The `shared_book` report target now requires a share between reporter and target for that book.

### 5. App
- Schema/migration for `books.originKey`; `buildBookRowFromServer` maps it; `pullSync` writes it outside the revision gate when it differs (like `finishedAt`); the push (`bookToSync`) never sends it.
- `services/social/shares.ts`: `useSharesForBook`, `useCreateShare`, `useRevokeShare`, `useRespondToShare` (accept then `syncNow`).
- Book detail: "Share" header action when signed in with sync, the book is synced, non-series and has server content; otherwise the picker explains why (local-only, not synced yet, series chapter). `ShareSheet`: friends list (identity cards) or a link to the Social tab, first-share rights checkbox when the server answers `consent_required`, error with retry, success toast. "Shared with" section lists open shares ("Waiting for @handle" / "Not accepted") with Revoke.
- Inbox: `share_received` row with cover, title, author, word count, sender identity; Accept / Decline / Report (ReportSheet, `shared_book`, sender's book id); "no longer available" for `unavailable`; `share_accepted` and `share_removed` copy.

### 6. Docs, legal, tests
- Privacy (what is copied, stays with the recipient, share record retention, consent record), terms (sharing rule), CONTEXT.md (Share, Content origin), `docs/social-sharing.md`, `.env.example` `ORIGIN_KEY_SECRET`.
- `shares.integration.test.ts`: create (friends only, suspended, local-only / series / tombstone / taken-down source, duplicate pending and declined, daily cap, consent recorded once), inbox item with book card, revoke, decline silent, expiry, unfriend and block revocation, accept copies the right fields with new id and inherited origin, copy of a copy, duplicate linking including a race, copy survives unfriend / block / sender deletion, both takedown scopes with revocation and `share_removed` items, origin refused afterwards. `sync-book-upsert.integration.test.ts`: origin defaults to own ids, copy record wins on insert, a push carrying origin fields or updating a copy changes nothing. `account-deletion.integration.test.ts`: shares, copy records and consent purged, recipient copy stays. Route-free unit test for `originKey`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Origin is set in exactly two places: `bookInsertValues` (copy record or own ids) and `copyBookForUser` (`INSERT … SELECT` inherits the source's). Neither upsert set names the columns, and the push schema strips unknown fields, so a payload that carries origin fields is a no-op on them. The migration backfills before setting NOT NULL; on a large table the UPDATE is the slow step and should be timed on a copy first.

`copyBookForUser` runs the insert inside a savepoint (`tx.transaction` nested) because a unique violation from the live-origin index would otherwise abort the caller's transaction; the violation is turned into a link to the racing copy. `generateBookId` collisions retry once. The share row snapshots title, author and word count at share time so the recipient's item still describes the offer after the source changed or vanished; the cover comes from the live source only.

`shareSubjectsFor` (`share-items.ts`) is a separate module from `shares.ts` to avoid an import cycle through `inbox.ts`: inbox → share-items → moderation, while shares → inbox. `liveShareItem` in the inbox predicate keeps a received-share item as long as the share row exists and is not revoked; revoke, unfriend and block delete the item explicitly.

Reports of a shared book go through the share id (`ReportBody.subjectId`), and the target registry requires that the reporter received that share from the reported sender; this closes the 171.6 review note about arbitrary `(user, book)` pairs. The takedown `origin` scope removes the reported row plus every other live row with that origin except the origin row itself; when the reported row is the origin (the uploader's own book), it is removed as the reported copy. Every takedown record carries the origin, so `isOriginTakenDown` holds afterwards even with zero surviving copies.

`ORIGIN_KEY_SECRET` is optional: without it the key is derived from `BETTER_AUTH_SECRET`, so no deploy step is needed; documented in `.env.example` and `docs/social-sharing.md`. Client: `books.origin_key` (0034) is written outside the revision gate whenever the pulled key differs, so books already on a device get it on the first pull and a rotated secret self-heals. The share sheet learns "not synced yet" from the local server-content-id cache, which is the client's best knowledge of what the server holds. Migration 0026 applied to the dev DB. UI not exercised in a browser or on a device.

## Review pass (five sonnet reviewers, every claim verified by hand)

Confirmed and fixed:
- A declined share vanished from the sender's book page at once (`listSharesForBook` listed pending only), revealing the decline. Declined shares are now listed like pending ones ("Waiting", then "Not accepted" after 30 days); a sender who withdraws one closes it as `expired`, not `revoked`, so the decline's re-share cooldown holds. `already_shared` covers pending, declined and closed-early rows within 30 days.
- A never-answered offer stays `pending` in the table; re-offering the same book after its expiry collided with the pending-only unique index and would have returned a 500. `createShare` now closes such stale rows as `expired` before inserting.
- Origin-scope takedown after the sender's account deletion found nothing: the reported row is hard-deleted with the account and the share rows cascade too. Shared-book notice snapshots now record the origin ids, `decideNotice` passes them to `takeDownReportedBook`, and with nothing recorded the reported row is taken to be its own origin. A statement item is no longer written for a target account that no longer exists (FK violation).
- A push of a copy whose recorded origin already has another live row in the account would have violated the one-live-copy index and aborted the whole sync push. `withoutDuplicateOrigins` drops such rows from the payload (the stale local row stays on the device).
- `purgeOldShares` ran inside the share transaction, so a refused share rolled the housekeeping back; it runs before the transaction now. Test added for the 90-day purge.
- Conventions: shared `isUniqueViolation` (`lib/db-errors.ts`), `pairIn` row-tuple helper (`lib/sql-helpers.ts`) replacing two ad-hoc `inArray` tuples, `isShareableRow()` shared between `copy-book.ts` and `share-items.ts`, `shareExpiryCutoff` helper, `SQL | undefined` instead of `ReturnType<typeof and>`, the `not(and(...)) as ... & object` cast replaced by plain SQL, one hook registration instead of two (a block always ends the friendship first).
- `shareSubjectsFor` used `friendshipExists`; now `areFriends`, so a banned or handle-less sender shows `unavailable` rather than a pending item that fails on accept.
- App: nested `<label>` in the share sheet's consent row replaced by a span; the sheet shows "Checking…" instead of the friend list while the server-content cache is still loading (`ShareBlocker` `checking`); the server-content-id query key lives in `query-keys.ts` (`syncKeys`); Report on a share item is available in every state, disabled while a response is pending; `share_accepted` and `share_received` actors link to their profile; a failed post-accept sync shows a toast.
- Tests: `origin.test.ts` restored env vars by assigning `undefined` (which stores the string "undefined"); the daily-cap fixture produced colliding ids for i ≥ 16; the duplicate-link test now races two transactions; a test covers origin takedown after the sender's deletion; the file states that its tests run in order.

Not changed: `purgeOldShares` also deletes accepted records after 90 days (the privacy text says closed records go after 90 days; the copy itself is unaffected); consent is checked last so the user sees the real blocker first; per-item availability checks in `shareSubjectsFor` (N+1 on at most 30 rows); `sync_book_copy` rows are never reaped (by design, they are what keeps an origin after Clear cloud data).

Verification after fixes: web 132/132 on a fresh migrated database, core 121/121, capacitor 662/662, type-checks and biome clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Share a book with a friend

### What changed
- **Core**: `SyncResponseBook` with `originKey`; `SOCIAL_API.share*`; `ShareBodySchema`, `ShareIdBodySchema`, `ShareRespondBodySchema`; `SHARE_TTL_DAYS`, `SHARE_DAILY_LIMIT`, `SHARE_RECORD_RETENTION_DAYS`; `OutgoingShare`; inbox types `share_received`, `share_accepted`, `share_removed`; `InboxSubject` union with the share subject (state plus book card); `shareErrorMessage`; `ReportBody.subjectId` (share id for shared-book reports).
- **Database** (`0026_shares.sql`): `sync_books.origin_user_id/origin_book_id` (backfilled, NOT NULL, indexed, partial unique per user and origin on live rows), `sync_book_copy`, `social_share` (with title/author/word-count snapshot, partial unique on pending), `social_share_consent`. Capacitor `0034_origin_key.sql`: `books.origin_key`.
- **Server**: `lib/origin.ts` (`originKey`), `bookInsertValues(userId, book, origin?)` fed by copy records in the push, article import sets own ids, pull returns `originKey` and `linkRanges`, `hideFromProfile` now also on pull. `lib/social/copy-book.ts` (`copyBookForUser`, `shareableSource`), `shares.ts` (`createShare`, `listSharesForBook`, `revokeShare`, `respondToShare`, `revokePendingSharesBetween`, `revokeShares`), `share-items.ts` (`shareSubjectsFor`), `share-hooks.ts` (unfriend and block revoke). Inbox lists share items with live state and counts them while the share exists. `moderation/takedown-shares.ts` (`takeDownReportedBook` with copy/origin scope, pending-share revocation, `share_removed` items); `decideNotice` takes `scope`; admin queue offers the scope for shared-book notices; the `shared_book` target requires the reporter's share. Routes `POST /api/social/share`, `share-revoke`, `share-respond`, `GET shares-for-book`. New error codes `consent_required` (428), `not_shareable`, `already_shared` (409), `suspended` (403), `unavailable` (410).
- **App**: `originKey` stored on pull; `services/social/shares.ts`; `ShareSheet` (friend picker with identity, blockers for local-only / unsynced / series books, first-share rights checkbox on `consent_required`, error with retry) opened from a Share header action on the book page when signed in with sync; `BookShares` "Shared with" section with Revoke; inbox share rows with book card, Add to library (then `syncNow`), Decline and Report, "no longer available" state, `share_accepted` and `share_removed` copy.
- **Docs and legal**: privacy "Sharing books", terms sharing rule, CONTEXT.md Share and Content origin, `docs/social-sharing.md`, `.env.example` `ORIGIN_KEY_SECRET`.

### Tests
- `shares.integration.test.ts` (11): refusals per reason, consent recorded once and inbox item with book card, revoke and suspended sender, silent decline with cooldown and expiry, unfriend/block revocation and hidden unavailability, accept field-by-field with new id and inherited origin and sender item, copy of a copy and duplicate linking, daily cap from Postgres rows, copy survival through unfriend/block/sender deletion, share-gated report and origin-scope takedown (copies removed, origin refused, pending revoked, `share_removed` items), copy scope. `sync-book-upsert` (+2: own origin ignoring payload fields, copy record wins and later pushes keep it), `account-deletion` (shares, consent, copy record purged, recipient copy stays), `moderation` (shared-book report via share), `origin.test.ts`. Web 130/130 on a fresh migrated DB, core 121, capacitor 662, type-checks and biome clean.

### Follow-ups
- TASK-171.8 reuses `copyBookForUser` (via `buddy_read`) and `isSharingSuspended`. TASK-123 quota should count copies against the recipient. UI not run in a browser or on a device.
<!-- SECTION:FINAL_SUMMARY:END -->
