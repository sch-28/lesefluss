# Live board

Always-on live progress inside a buddy read (TASK-171.15, which replaced the reading races of
TASK-171.12). Rules: `apps/web/src/lib/social/live-board.ts` (pure, unit-tested); membership,
visibility, opt-out and streams: `live.ts`; routes: `api/social/live.ts` (POST `report` / `stop`)
and `api/social/live-stream.ts` (server-sent events). In the app, `pages/reader/live-board.tsx`
(`useLiveReading`) reports and streams, and `pages/reader/buddy-read-markers.tsx` draws members on
the progress bar: dots on the collapsed line, avatars and a detail popover when expanded.

## Single node

Live state lives in the web server's memory. Apps/web runs as one container, so that is enough
for now. A restart drops everyone from the board until their next report two seconds later. Running
more than one instance needs a shared channel (for example Redis pub/sub) first.

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
- `social_profile.share_live_reading` off: reports are dropped, the user leaves every board at once,
  and their stream carries `live: false` with no members.
