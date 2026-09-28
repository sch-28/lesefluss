# Live board

Always-on live progress inside a buddy read (TASK-171.15, which replaced the reading races of
TASK-171.12). Rules: `apps/web/src/lib/social/live-board.ts` (pure, unit-tested); membership,
visibility, opt-out and streams: `live.ts`; routes: `api/social/live.ts` (POST `report` / `stop`)
and `api/social/live-stream.ts` (server-sent events). In the app, `pages/reader/live-board.tsx`
(`useLiveReading`) reports and streams, and `pages/reader/buddy-read-markers.tsx` draws members on
the progress bar: dots on the collapsed line, avatars and a detail popover when expanded.

## Single node and cost

Live state lives in the web server's memory. Apps/web runs as one container, so that is enough
for now. A restart drops everyone from the board until their next report two seconds later. Running
more than one instance needs a shared channel (for example Redis pub/sub) first.

Every 5 seconds a sweep re-checks each live reader and each open stream. One check is a
`memberView` (the buddy read row, `loadState` with its members and books, and `visibleTo`,
about five queries) plus one `sharesLive` query, so a round costs about six queries per live reader
and per listener, run one after another. Buddy reads are capped at eight members, so a busy read
costs about a hundred queries per round. A round still running when the next one is due is skipped,
so under load blocks, opt-outs and removals can take longer than 5 seconds to apply.

The sweep only acts on definite answers:
- A member who is gone (not a current member, the book is gone, or the read is no longer in
  progress) is taken off the board, and their stream is closed.
- A member who opted out is taken off the board, and their stream keeps sending `live: false`.
- Any other failure, such as a database error, changes nothing and is retried next round.

## Flow

- An open reader of a buddy-read book reports `{ position, mode, dialWpm }` every two seconds while
  the app is in the foreground and online, and sends `stop` when it closes or goes to the
  background. A reader silent for 30 seconds drops off; its next report starts a new sitting.
- Speed is the words credited in the sitting over its duration, shown once the sitting is 20
  seconds old. Credit uses the reading tracker's `refillCredit` / `spendCredit` from
  `@lesefluss/core`, with refill capped at 10 seconds per report, so jumps, backward moves and a
  forged RSVP dial never show more than the plausibility cap.
- Snapshots are built per viewer: only other current members the viewer may see (no block either
  way), never the viewer. Everyone else keeps their last synced position from the buddy-read
  progress endpoint.
- Reports and stops carry the client's `sentAt`. A stop older than that client's latest report
  arrived out of order and is ignored, so a quick background and foreground does not drop the
  reader. On the web build a closing tab sends its stop with `keepalive` on `pagehide`.
- `live-report` is limited to 300 requests a minute per user: about nine open readers at once
  (tabs, devices) at 30 reports a minute each, plus their stops.
- A buddy read that is not in progress takes no reports and opens no streams (`not_found`).
- The app stops reconnecting and reporting after a 400, 401, 403 or 404, and keeps backing off
  after network errors, 429 and 5xx.
- `social_profile.share_live_reading` off: reports are dropped, the user leaves every board at once,
  and their stream carries `live: false` with no members.
