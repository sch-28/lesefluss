---
id: TASK-171.9
title: >-
  Buddy-read discussion: spoiler-gated comments at a position and reactions to
  shared highlights
status: To Do
assignee: []
created_date: '2026-09-25 22:12'
updated_date: '2026-09-25 22:45'
labels:
  - social
  - web
  - app
milestone: m-6
dependencies:
  - TASK-171.8
  - TASK-171.6
documentation:
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
parent_task_id: TASK-171
priority: medium
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The social part of reading together: talk about the book without spoiling it for the slower reader. Supersedes archived TASK-66 (comments on books/chapters) for buddy reads, and the "react to each other's highlights" part of archived TASK-64.

Depends on TASK-171.8 (buddy read, membership, identical content via origin, marker layer) and TASK-171.6 (report flow and extensible target types).

Because all participants share one content origin, a comment anchored to a word position means the same place in the text for everyone (ADR-0002). Anchors use the same shape as highlights in `sync_highlights`: `startWord`/`startCharInWord` and `endWord`/`endCharInWord`.

Scope:
- **Comments**: a participant can post a comment anchored to a word position or range in the buddy-read book (from a text selection in the reader, or "comment here" at the current position), or to a chapter as a whole. Replies are one level deep and inherit the parent's anchor. Authors can edit the body of their own comments (not the anchor) and delete them; a deleted comment with replies shows as removed.
- **Shared highlights**: a participant can share an existing highlight into the buddy read and unshare it again; unsharing deletes its reactions. Highlights and their notes are private data (ADR-0004), so nothing is shared implicitly: the share dialog previews exactly what others will see (snippet and note). An optional per-buddy-read "share all my highlights" toggle, off by default, covers existing and future highlights of that book and needs a confirmation that says notes are included.
- **Reactions**: a small fixed emoji set on comments and shared highlights; one reaction per emoji per user.
- **Spoiler gating (server-enforced)**: a viewer only receives comments and shared highlights (including their replies and reactions) anchored at or before their own furthest position in the book, plus a count of hidden items ahead. Chapter-level comments unlock at the chapter's `startWord`. The viewer's own items are always visible to them. A per-user, per-buddy-read "show everything" override, behind a spoiler confirmation, can be switched off again. Hidden counts exclude blocked users' items. Gating uses the server's stored position, never a request parameter. It is one exported server function (`isVisibleToViewer(buddyReadId, viewerId, anchor)`) that TASK-171.11 reuses for push previews.
- **Surfaces**: discussion list in the buddy-read screen (grouped by chapter; authors shown by TASK-171.1 identity card, never `user.name` or email; edited comments marked "edited"), and in the reader a marker in the margin (scroll/page) or on the progress bar (RSVP) where unlocked items exist; tapping opens the thread. States: loading, empty ("no comments yet"), everything hidden ("N comments ahead of you"), offline or failed fetch (retry; composing disabled offline), and a failed post that keeps the draft.
- **Notifications**: inbox items (TASK-171.4) for replies to your comment and reactions to your comment or shared highlight, batched per item.
- **Moderation**: comments and shared highlights are report target types in TASK-171.6 (report action on each item, web form location, admin queue). The notice snapshot holds the comment body, or the highlight snippet and note, as reported, so a later edit cannot erase evidence. Takedown deletes the comment, or removes the share (never the author's private highlight), and sends the author a statement of reasons through the TASK-171.6 flow.
- **Blocks** (symmetric, as in TASK-171.8): when either of two participants blocks the other, neither sees the other's comments, replies, shared highlights or reactions, neither can reply to or react on the other's items, and neither is notified about the other.
- **Limits** (constants in one place): comment body 1 to 2,000 characters after trimming; 30 comment posts or edits per user per 10 minutes; 120 reaction changes per user per 10 minutes. Buddy-read highlight shares have no snippet cap (the audience is a closed group reading the same copy).
- **Membership changes**: when a participant leaves or is removed, their comments stay (still attributed by handle) and their shared highlights stop showing. Replies and reactions require current membership.
- **Retention**: a finished buddy read keeps its discussion open. When a buddy read is deleted (TASK-171.8), its comments, shared-highlight references and reactions are deleted with it.

Out of scope: public book discussion outside buddy reads, images/attachments in comments, rich text, offline posting.

Implementation notes (verified against the code):
- **Server tables** (`apps/web/src/db/schema.ts`, one migration in `apps/web/drizzle/`): discussion items keyed by buddy-read id (FK with `onDelete: "cascade"`) with a `kind` column (`comment` now; TASK-171.12 adds an unanchored, system-generated `race_result` kind that is always visible and not a report target), author user id, optional parent id, anchor (`startWord`, `startCharInWord`, `endWord`, `endCharInWord`) or chapter `startWord`, body, `createdAt`/`editedAt`/`deletedAt`; shared highlights; reactions with a unique index on `(target, userId, emoji)`. Index on `(buddyReadId, startWord)`. Validate anchors server-side: `0 <= startWord <= endWord < word_count` of the viewer's linked book (reject when `word_count` is null), and a chapter anchor must equal a `startWord` in that book's `chapters` JSON.
- **Shared highlights are references, not copies.** Store `(buddyReadId, userId, highlightId)` pointing at the author's own `sync_highlights` row and join it at read time, filtering out `deleted = true` rows and rows whose `bookId` is no longer the author's linked book. Nothing is written under another user's id, so the highlight push's full-set tombstoning (`api/sync.ts`) cannot delete it. The "share all" toggle is a flag on the membership. A highlight exists server-side only after the author's next push, so the client pushes first and the endpoint returns a clear error for an unknown highlight. Null `text`: adopt TASK-61's rule (the client fills missing text from local content with `WordIndex` before pushing; the endpoint rejects a still-null text).
- **Furthest position.** `sync_books.word_position` goes backwards on a jump back, and `sync_reading_sessions` rows can be deleted (`api/sync/delete-session.ts`, `api/sync/wipe-sessions.ts`). Add a monotonic `furthestWord` column to the TASK-171.8 membership row, updated to `max(furthestWord, word_position, max(end_word) of the user's sessions for that book)` whenever the server reads the viewer's position, never lowered. Position is only as fresh as the viewer's last sync push (a few seconds after position saves), which is acceptable.
- **Tokenizer.** Anchors skew with a `WordIndex` rule change the same way progress does; reuse whatever TASK-171.8 records.
- **Endpoints** are file routes under `apps/web/src/routes/api/` with `middleware: [cors, requireAuth]`, all mutations POST, called through TASK-171.1's authed-fetch helper. Every endpoint checks current buddy-read membership plus TASK-171.2's block-and-ban helper (no block either way, neither banned), not friendship: members need not be friends and unfriending removes no one. Rate-limit with `checkLimit`, keyed e.g. `buddy-comment:${userId}`.
- **Client data** is fetched with TanStack Query under TASK-171.3's social key prefix; no local SQLite, no sync payload change.
- **Reader integration**: the selection toolbar (`selection-toolbar.tsx`, `use-highlight-selection.ts`) gets a "Comment" action; margin markers in `scroll-view.tsx` and `page-view/index.tsx`; RSVP markers on TASK-171.8's marker layer (`use-scrub-progress.ts`, `rsvp-view.tsx`).
- **Inbox**: reply and reaction types via TASK-171.4's `createNotification`, in the same transaction, collapsed per `(recipient, type, subject)`. Never notify a user about their own actions or about someone they are in a block relation with.
- **Account deletion**: reactions and shared-highlight references cascade on `user.id`. Comments need purge code in `purgeUserSyncData` (reached by all three paths since TASK-171.1): delete the user's comments without replies, and turn those with replies into a body- and author-less "removed" placeholder (author column `onDelete: "set null"` as a backstop). Extend `account-deletion.integration.test.ts`.
- **Docs**: add "buddy-read comment" to `CONTEXT.md` and extend the single "shared highlight" entry (shared with TASK-61) to cover buddy reads; in the privacy policy describe both as shared data: who sees them (current participants, subject to spoiler gating and blocks), that shared highlights include notes, and retention.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A participant can post a comment anchored to a selection, to their current position, or to a chapter; anchors outside the book or not matching a chapter start are rejected
- [ ] #2 Replies one level deep, edit of own comment body and delete of own comments work; edited comments are marked as edited and a deleted comment with replies shows as removed
- [ ] #3 A participant can share an individual highlight into the buddy read after a preview showing its snippet and note, and can unshare it, which removes it and its reactions for everyone
- [ ] #4 Highlights are not shared unless the user shares them individually or turns on the per-buddy-read "share all" toggle, which is off by default and requires a confirmation that notes are included
- [ ] #5 Editing or deleting a shared highlight through normal highlight sync updates or removes it in the buddy read
- [ ] #6 Participants can add and remove emoji reactions from the fixed set on comments and shared highlights; a repeated reaction with the same emoji does not create a duplicate
- [ ] #7 A viewer never receives comment, reply, reaction or shared-highlight content anchored beyond their own furthest position in the book, verified at the API level
- [ ] #8 Content a viewer has unlocked stays visible after they jump back in the book or wipe their reading sessions
- [ ] #9 The viewer's own comments and shared highlights are always visible to them regardless of position
- [ ] #10 The viewer sees a count of hidden items ahead of their position
- [ ] #11 A user can turn on showing all items after a spoiler confirmation and turn it off again, after which gating applies again
- [ ] #12 The reader shows markers where unlocked comments or shared highlights exist, in scroll, page and RSVP modes
- [ ] #13 The discussion screen handles loading, empty, all-hidden, offline and failed-fetch states, and a failed post keeps the draft
- [ ] #14 Authors are shown by handle, display name and avatar only; no API response in this feature contains user.name or email
- [ ] #15 Replies and reactions create inbox items for the author, batched per item, and never for the author's own actions
- [ ] #16 Comments and shared highlights can be reported; the notice keeps the text as reported even if it is edited later, and takedown removes the comment or the share (not the author's highlight) and sends the author a statement of reasons
- [ ] #17 When either of two participants blocks the other, neither sees the other's comments, replies, shared highlights or reactions, neither can reply to or react on the other's items, and neither gets inbox items about the other
- [ ] #18 Non-members, including participants who left or were removed, cannot read, post or react in a buddy read's discussion; a leaver's comments stay and their shared highlights stop showing
- [ ] #19 Comment bodies that are empty or over 2,000 characters are rejected, and the comment and reaction rate limits return a rate-limit error when exceeded
- [ ] #20 Deleting a buddy read deletes its comments, shared-highlight references and reactions
- [ ] #21 Account deletion through deleteUserAccount, better-auth /delete-user and deleteAdminUser removes the user's reactions and shared highlights and removes or anonymises their comments, verified in account-deletion.integration.test.ts
- [ ] #22 Tests cover spoiler gating at boundaries (exactly at, before and after the anchor), chapter-level unlock, the monotonic furthest position, the override, block visibility in both directions and unsharing
- [ ] #23 CONTEXT.md and the privacy policy cover buddy-read comments and shared highlights, including that shared highlights include notes and who can see them
- [ ] #24 Two members who are not friends, or who unfriended after joining, can read, post and react in the discussion as long as neither blocks the other
- [ ] #25 Sharing a highlight whose text is still null on the server is rejected with a clear error, and the client fills missing text from the local book before pushing
- [ ] #26 Spoiler gating is one exported server function that the discussion fetch uses and that later subtasks can call for a single item
<!-- AC:END -->
