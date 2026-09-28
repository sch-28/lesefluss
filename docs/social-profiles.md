# Social profiles

How a friend's profile is resolved and served. Profiles exist only in the app (native and the
web build under `/app`); there is no website profile page and no public profile.

## Profile view API

`GET /api/social/profile-view?userId=<id>[&as=friend][&tz=<IANA zone>]`, behind `cors` +
`requireAuth` (bearer on native, cookie on the web build), rate-limited per viewer, answered with
`Cache-Control: private, no-store`. Resolver: `apps/web/src/lib/social/profile-view.ts`.

- Lookup is by user id. Handles are display only and never appear in a URL.
- `as=friend` is honoured only for the caller's own id: the owner previews their profile as a
  friend would see it, toggles included.
- `tz` is the viewer's zone, used for "this year" and finish dates; UTC without it or when unknown.
- Any of these returns the same 404 as a non-existent user: a stranger, a block in either
  direction (a block deletes the friendship in the same transaction, so a live friendship row is
  proof of no block), a banned owner, an owner without a handle, a deleted account.

## Visibility matrix

| Viewer / profile visibility | private | friends |
|---|---|---|
| Owner | everything, toggles ignored | everything, toggles ignored |
| Friend | identity card + friends-since | identity card, friends-since, bio, friend count, each section whose toggle is on |
| Stranger, blocked, signed out | not found | not found |

Sections and their toggles are the `PROFILE_SECTIONS` map in `packages/core/src/social.ts`:
`currentlyReading` (`show_currently_reading`), `finished` (`show_finished`), `stats`
(`show_stats`). A section a friend may not see is absent from the response, not empty.

What each section contains (and never contains): see `ProfileBook`, `ProfileFinishedBook` and
`ProfileStats` in core. No review text, notes, tags, exact word position, individual sessions or
email. Articles (`source = 'url'`) are excluded from the lists but count in the stats. Serial
chapters roll up to one entry per series. Deleted rows are excluded everywhere. Time and speed are
`null` without synced sessions; speed is `measuredReadingSpeed` from core, never the RSVP dial.

## Hide from profile

`sync_books.hide_from_profile` (Postgres) and `books.hide_from_profile` (SQLite), set in the book
edit sheet. Excluded from every section and from the stats, including the book's sessions. The
flag rides the metadata revision but merges on its own rule (`apps/web/src/lib/sync-book-upsert.ts`,
`bookUpsertSetFor`): absent in the payload keeps the server value, present is gated by
`metadata_updated_at`, a tombstone clears it. It is deliberately not in `METADATA_FIELDS`, because
a client that knows `status` but not the flag would otherwise clear it.

## Covers

Catalog books return `{ kind: "catalog", catalogId }` and the app builds the catalog proxy URL.
Uploaded and serial covers return `{ kind: "url", url }` pointing at
`/api/social/cover-image/<token>`: an HMAC-signed token (`apps/web/src/lib/social/cover-token.ts`,
key `BETTER_AUTH_SECRET`, 1 h) naming viewer, owner and cover, because an `<img>` on native cannot
send a bearer token. The route verifies the token and re-checks the friendship and both users'
visibility (handle, not banned) before serving, so a block or ban cuts access at once. It is rate
limited per client IP since a bad token names nobody. Covers are never inlined as base64 in the JSON.
