# Buddy reads

Read one book together and see where everyone is. Built on book sharing (`social-sharing.md`):
a buddy read is bound to a content origin, so every member reads the same word stream and word
positions compare exactly (ADR-0002, ADR-0004).

## Tables (`apps/web/drizzle/0027_buddy_reads.sql`)

- `buddy_read`: origin pair (no FK), `host_id` (FK set null), title and author snapshot, status
  `in_progress` | `finished`, `target_date`, `created_at`, `finished_at`.
- `buddy_read_member`: PK `(buddy_read_id, user_id)`, the linked `book_id`, state `active` |
  `left` | `removed`, `joined_at`, `left_at`, `finish_armed`, `finished_at`. Rows cascade with the
  read and with the user.
- `buddy_read_invite`: inviter, invitee, status `pending` | `accepted` | `declined` | `cancelled`;
  one pending invite per read and invitee (partial unique index).

No client table: the app holds buddy-read state in TanStack Query under the `social` key prefix,
so sign-out clears it.

## Server (`apps/web/src/lib/social/`)

- `buddy-read-eligibility.ts`: `sharesActiveBuddyRead` (both active with a live linked
  `sync_books` row, neither banned), which gates friend requests and blocks between non-friends.
  `loadState` in `buddy-reads.ts` applies the same current-member rule to participant lists.
- `buddy-reads.ts`: every write locks the read row (`FOR UPDATE`) and first runs `settle`, which
  marks members whose book is gone as left, records finishes and their inbox items, finishes the
  read when every member has, derives the host (stored host while a non-banned current member,
  else the earliest-joined one) and deletes a read with no member left. After an origin takedown
  every copy is tombstoned; members then stay active and see only `originUnavailable`.
- Invites: host only, read in progress, host not suspended, each invitee an accepted friend who
  is not a member. Members plus seat-holding invites (pending, under 30 days, inviter still a
  member) stay at or below 8. `isInviteVoid` is the single voiding rule used by accept and the
  inbox. `buddy-read-hooks.ts` cancels pending invites on unfriend and block.
- Join: a live copy of the origin in the joiner's library is linked; otherwise the inviter must
  not be suspended and the copy comes from the host's row, else any member's still-shareable row
  (`copyBookForUser`, `via: "buddy_read"`). `finish_armed` starts true unless the linked book is
  already past the finished threshold, so only a finish after joining counts.
- Reads: `listBuddyReads`, `getBuddyRead` (participants filtered by ban and blocks toward the
  viewer, relationship per participant, `approximate` when word counts differ, pending invites for
  the host), `getBuddyReadProgress` (read-only marker payload, other members only).
- `settleBuddyReads(userId, bookIds)` runs after the sync push transaction commits, best effort,
  and only for memberships that have not finished yet.
- `purgeCloudData` calls `endBuddyReadsOf`: without books the user no longer counts, and a read
  left empty is deleted at once. Account deletion (account page and admin, both through
  `deleteUserAccount`; better-auth's own delete routes are disabled) goes through it too; FK
  cascades remove the rows.

Routes: `POST /api/social/buddy-read`, `buddy-read-invite`, `buddy-read-invite-cancel`,
`buddy-read-invite-respond`, `buddy-read-leave`, `buddy-read-remove-member`,
`buddy-read-target-date`; `GET buddy-reads`, `buddy-read-detail?id`, `buddy-read-progress?id`.

## App (`apps/capacitor/src`)

- `services/social/buddy-reads.ts`: queries and mutations. Progress polls every 60 s only while
  the app is in the foreground and online; it never refetches on mount inside that window.
- Book detail: "Start buddy read" (a sign-in explanation when signed out) and a card for the read
  whose `originKey` matches the book.
- `pages/social/buddy-reads.tsx`, `buddy-read.tsx`: list and detail. The viewer's own row uses the
  local position; chapter titles come from the viewer's own chapters.
- Inbox: invite rows with the visibility statement, Join and Decline; join triggers a sync so a
  delivered copy appears at once.
- Reader: `buddy-read-markers.tsx` renders dots above the progress track in every mode. A marker
  stops pointer events so a tap shows who is there without scrubbing.

## Discussion (TASK-171.9)

- Tables (`0028_buddy_read_discussion.sql`): `buddy_read_comment` (anchor kind `range` | `chapter`,
  replies copy the parent's anchor, author set null on account deletion), `buddy_read_shared_highlight`
  (a reference to the author's `sync_highlights` row; `shared_individually` false for rows made by
  share-all; `removed_at` for takedowns), `buddy_read_reaction` (one target, unique per target, user
  and emoji). Membership gains `furthest_word`, `share_all_highlights`, `show_everything`.
- Gate (`discussion-gate.ts`): `refreshFurthestWord` raises `furthest_word` from the synced position
  and the furthest session, never lowers it. `isUnlockedFor` opens any item once its start is within
  `UNLOCK_LOOKAHEAD_WORDS` (about a screen) of that position, since a saved position is the top of the
  screen; own items and show-everything skip it. `getDiscussion` also returns `nextUnlockWord`, where the
  nearest hidden item unlocks; the reader pushes and refetches once a save reaches it
  (`useRefetchDiscussionAsYouRead`) instead of waiting for the 60s poll. `isVisibleToViewer` is
  the single-item form (membership, block, gate) for reports and later push previews.
- `buddy-read-discussion.ts`: post, reply, edit, delete (placeholder when replies exist), share and
  unshare highlights (server needs the pushed highlight with text), share-all materialised lazily on
  read, reactions, `getDiscussion` (blocked or banned people dropped before counting `hiddenAhead`,
  shared highlights of current members only), reply and reaction inbox items collapsed per item, and
  `purgeDiscussionOf` for account deletion.
- Moderation: targets `buddy_read_comment` and `buddy_read_highlight` (reporter must be a member who
  can see the item), actions `remove_comment` and `remove_highlight_share`.
- App: discussion screen (`/tabs/social/buddy-read-discussion/$id`), paragraph markers in scroll and
  page mode, ticks under the progress bar in every mode, a thread sheet, "Comment" in the selection
  toolbar and "Share to the buddy read" in the highlight modal. The discussion polls every 60 s while
  the reader is in the foreground and online.
