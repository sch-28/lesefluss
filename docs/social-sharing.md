# Book sharing

One friend, one book, one copy. Decided in ADR-0004; the copy exists so that buddy reading
(TASK-171.8) compares positions in identical word streams.

## Content origin

Every `sync_books` row carries `origin_user_id` / `origin_book_id`. An upload is its own origin;
a copy inherits the source's, so a copy of a copy still points at the first uploader's row. Rules:

- Set on insert only, by the server: `bookInsertValues(userId, book, origin?)` uses the row's
  copy record when there is one (`sync_book_copy`, loaded once per push in `routes/api/sync.ts`)
  and the row's own ids otherwise. Neither upsert set mentions the columns, so a push can never
  move an origin. `article-import.ts` sets own ids.
- `sync_book_copy` is server-only and untouched by Clear cloud data, which is what lets a copy
  that is pushed back after a purge keep its origin.
- Pull adds `originKey` (`lib/origin.ts`: HMAC-SHA256 of the pair with `ORIGIN_KEY_SECRET`, or a
  key derived from `BETTER_AUTH_SECRET`). The app stores it in `books.origin_key`, writes it
  outside the revision gate, and never pushes it.
- The partial unique index `(user_id, origin_user_id, origin_book_id) WHERE NOT deleted` is what
  makes duplicate linking race-safe.

## Copying (`lib/social/copy-book.ts`)

`copyBookForUser(tx, { sourceUserId, sourceBookId, recipientId, via })`: links to the recipient's
live row with the same origin when there is one; otherwise `INSERT … SELECT` from the source row
(content, cover, chapters, link ranges, title, author, description, language, source, catalog id,
size, word count; position 0; `added_at`, `updated_at`, `metadata_updated_at` = now) with a fresh
8-hex id and one retry on a PK collision, inside a savepoint so a unique violation from a racing
copy can be turned into a link. Writes the copy record. Throws `unavailable` when the source is
gone, has no content or is a series chapter.

## Shares (`lib/social/shares.ts`)

- `createShare`: purge of the sender's old records, friendship (`areFriends`), suspension,
  shareable source and origin not taken down, no pending or declined-unexpired share for the same
  recipient and origin, fewer than 20 shares in 24 h (Postgres count), consent
  (`social_share_consent`, `confirmRights` needed once). Inbox item `share_received`.
- `respondToShare`: decline is silent (item marked read); accept re-checks friendship, suspension
  and takedown, copies, marks the share accepted with `copy_book_id`, sends `share_accepted`.
- `revokeShare` (sender, pending only) deletes the recipient's item. `share-hooks.ts` revokes
  pending shares on unfriend and block.
- `share-items.ts` computes the inbox subject per item: `pending` only while the source is live,
  the sender not suspended, the origin not taken down and the two still friends; every other case
  is `unavailable`, with no reason. The book card comes from the snapshot on the share row; the
  cover from the live source through the signed cover URL.
- Routes: `POST /api/social/share`, `share-revoke`, `share-respond`, `GET shares-for-book`.

## Takedown scopes (`lib/moderation/takedown-shares.ts`)

A shared-book notice can be actioned as `copy` (the reported row) or `origin` (every other live
row with the same origin, found through the origin columns, skipping the origin row itself). Both
write `social_takedown` rows carrying the origin, so `isOriginTakenDown` refuses future shares,
revoke pending shares of the removed content and give every other affected owner a neutral
`share_removed` item. In-app reports of a shared book go through the share id and require that
the reporter received that share.
