# Activity feed

What the Social tab's Activity section shows and how its events come about (TASK-171.10).
Recording: `apps/web/src/lib/social/feed-transitions.ts` and `feed.ts`; API:
`apps/web/src/routes/api/social/feed.ts` and `feed-delete.ts`.

## Event types

| Type       | When                                                           | Profile section    |
| ---------- | -------------------------------------------------------------- | ------------------ |
| `started`  | derived status goes from `want` to `reading`                   | Currently reading  |
| `finished` | derived status becomes `finished`, or `finished_at` gets a date | Finished books     |

`FEED_EVENT_SECTION` in `@lesefluss/core` maps each type to its section; a new type (TASK-61's
shared highlight) adds a row there and a value to `FEED_EVENT_TYPES` and the table's check
constraint. A unique index on `(actor_id, book_id, type)` keeps one of each per book, so rereads,
position resets and two devices pushing the same change add nothing.

## Recording (on `POST /api/sync` only)

Inside the push transaction, the stored rows of the pushed books are read before the upsert and
the upsert returns the merged rows; `feedTransitions` compares the two. Derived status comes from
`bookStatus` (a NULL `status` means "from progress").

Nothing is recorded for:

- a book with no row on the server before the push: first sync, a new device restoring, imports;
- a finish more than 72 hours old (`finished_at`, or the server time when it has none): the app's
  startup backfill of historic finish dates, and anything else arriving late, is history;
- tombstoned rows, web-serial chapters (`series_id`) and articles imported by URL;
- pulls.

An event is written only while the actor's profile is visible to friends, "Share my reading
activity in friends' feeds" (`social_profile.feed_enabled`, default on) is on and the event's
section is on. Recording runs in a savepoint and only logs its failures: the feed never costs a
user their sync.

## Reading

`GET /api/social/feed[?cursor=][&tz=]`, `cors` + `requireAuth`, rate-limited per user
(`social-feed:<id>`), `Cache-Control: private, no-store`. Keyset pages of 20 on
`(created_at, id)`.

- Actors: the viewer and current friends who are socially visible (not banned, have a handle).
  A block deletes the friendship, so blocked people drop out with it.
- Every read re-checks the actor's settings: profile visible to friends, feed sharing on, the
  event's section on. The viewer's own events are always shown to them, labelled You.
- Book details are joined from the actor's `sync_books` row, which must be live, not hidden from
  the profile and not an article. Deleting the book, Clear cloud data and takedowns therefore
  hide events without any feed code.
- The day is formatted in the viewer's zone (`tz`), never with a time. Finished events carry the
  rating, never the review.
- Covers: catalog books by catalog id, other books through the friends-only signed cover route.

## Controls and retention

- `POST /api/social/feed-delete { eventId }` removes one of the caller's own events.
- Switching feed sharing off deletes all of the user's events in the same transaction.
- Events older than 90 days are filtered on read and deleted in small batches on each feed read
  (there is no scheduler).
- Account deletion removes events through the FK cascade on `actor_id`.
