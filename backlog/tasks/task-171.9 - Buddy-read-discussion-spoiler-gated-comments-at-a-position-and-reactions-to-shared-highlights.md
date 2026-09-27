---
id: TASK-171.9
title: >-
  Buddy-read discussion: spoiler-gated comments at a position and reactions to
  shared highlights
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 22:12'
updated_date: '2026-09-27 13:01'
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
- [x] #1 A participant can post a comment anchored to a selection, to their current position, or to a chapter; anchors outside the book or not matching a chapter start are rejected
- [x] #2 Replies one level deep, edit of own comment body and delete of own comments work; edited comments are marked as edited and a deleted comment with replies shows as removed
- [x] #3 A participant can share an individual highlight into the buddy read after a preview showing its snippet and note, and can unshare it, which removes it and its reactions for everyone
- [x] #4 Highlights are not shared unless the user shares them individually or turns on the per-buddy-read "share all" toggle, which is off by default and requires a confirmation that notes are included
- [x] #5 Editing or deleting a shared highlight through normal highlight sync updates or removes it in the buddy read
- [x] #6 Participants can add and remove emoji reactions from the fixed set on comments and shared highlights; a repeated reaction with the same emoji does not create a duplicate
- [x] #7 A viewer never receives comment, reply, reaction or shared-highlight content anchored beyond their own furthest position in the book, verified at the API level
- [x] #8 Content a viewer has unlocked stays visible after they jump back in the book or wipe their reading sessions
- [x] #9 The viewer's own comments and shared highlights are always visible to them regardless of position
- [x] #10 The viewer sees a count of hidden items ahead of their position
- [x] #11 A user can turn on showing all items after a spoiler confirmation and turn it off again, after which gating applies again
- [x] #12 The reader shows markers where unlocked comments or shared highlights exist, in scroll, page and RSVP modes
- [x] #13 The discussion screen handles loading, empty, all-hidden, offline and failed-fetch states, and a failed post keeps the draft
- [x] #14 Authors are shown by handle, display name and avatar only; no API response in this feature contains user.name or email
- [x] #15 Replies and reactions create inbox items for the author, batched per item, and never for the author's own actions
- [x] #16 Comments and shared highlights can be reported; the notice keeps the text as reported even if it is edited later, and takedown removes the comment or the share (not the author's highlight) and sends the author a statement of reasons
- [x] #17 When either of two participants blocks the other, neither sees the other's comments, replies, shared highlights or reactions, neither can reply to or react on the other's items, and neither gets inbox items about the other
- [x] #18 Non-members, including participants who left or were removed, cannot read, post or react in a buddy read's discussion; a leaver's comments stay and their shared highlights stop showing
- [x] #19 Comment bodies that are empty or over 2,000 characters are rejected, and the comment and reaction rate limits return a rate-limit error when exceeded
- [x] #20 Deleting a buddy read deletes its comments, shared-highlight references and reactions
- [x] #21 Account deletion through deleteUserAccount, better-auth /delete-user and deleteAdminUser removes the user's reactions and shared highlights and removes or anonymises their comments, verified in account-deletion.integration.test.ts
- [x] #22 Tests cover spoiler gating at boundaries (exactly at, before and after the anchor), chapter-level unlock, the monotonic furthest position, the override, block visibility in both directions and unsharing
- [x] #23 CONTEXT.md and the privacy policy cover buddy-read comments and shared highlights, including that shared highlights include notes and who can see them
- [x] #24 Two members who are not friends, or who unfriended after joining, can read, post and react in the discussion as long as neither blocks the other
- [x] #25 Sharing a highlight whose text is still null on the server is rejected with a clear error, and the client fills missing text from the local book before pushing
- [x] #26 Spoiler gating is one exported server function that the discussion fetch uses and that later subtasks can call for a single item
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation plan

### 1. Core (`packages/core/src/social.ts`)
- Constants: `BUDDY_COMMENT_MAX_CHARS = 2000`, `BUDDY_COMMENT_RATE = { max: 30, windowMs: 10 min }`, `BUDDY_REACTION_RATE = { max: 120, windowMs: 10 min }`, `BUDDY_REACTIONS = ["👍","❤️","😂","😮","😢","🔥"]`.
- Anchor type `{ kind: "range", startWord, startCharInWord, endWord, endCharInWord } | { kind: "chapter", startWord }`; Zod bodies for post, reply, edit, delete, share/unshare highlight, react/unreact, share-all toggle, show-everything toggle.
- Response types: `DiscussionItem` (comment with replies, or shared highlight; author `SocialIdentity | null` for removed; reactions as `{ emoji, count, mine }[]`; `edited`, `removed`, `isOwn`), `DiscussionPage { items, hiddenAhead, furthestWord, showEverything, shareAll }`.
- Notification types `buddy_read_reply`, `buddy_read_reaction`; notice target types `buddy_read_comment`, `buddy_read_highlight`; `SOCIAL_API` paths.

### 2. Database (`0028_buddy_read_discussion.sql`)
- `buddy_read_member` gains `furthest_word` (int, default 0), `share_all_highlights`, `show_everything` (bool, default false).
- `buddy_read_comment`: id, `buddy_read_id` (FK cascade), `kind` (`comment`; 171.12 adds `race_result`), `author_id` (FK set null), `parent_id` (FK cascade), `anchor_kind` (`range` | `chapter`), `start_word`, `start_char_in_word`, `end_word`, `end_char_in_word`, `body` (null once removed), `created_at`, `edited_at`, `deleted_at`. Replies copy the parent's anchor, so gating never needs a join. Index `(buddy_read_id, start_word)`.
- `buddy_read_shared_highlight`: id, `buddy_read_id` (FK cascade), `user_id` (FK cascade), `highlight_id`, `created_at`, `removed_at` (takedown; excludes it even under share-all and blocks re-sharing). Unique `(buddy_read_id, user_id, highlight_id)`. A reference to the author's own `sync_highlights` row, joined at read time; nothing is written under another user's id.
- `buddy_read_reaction`: id, `buddy_read_id` (FK cascade), `user_id` (FK cascade), `comment_id` (FK cascade, nullable), `shared_highlight_id` (FK cascade, nullable), `emoji`, `created_at`; partial unique indexes per target on `(target, user_id, emoji)`.

### 3. Server (`lib/social/buddy-read-discussion.ts`, `discussion-gate.ts`, hooks)
- **Furthest position**: `refreshFurthestWord(tx, readId, userId)` raises `furthest_word` to `max(furthest_word, sync_books.word_position, max(end_word) of the user's sessions on the linked book)`, never lowers it. Runs on every discussion read and post.
- **Gate** (`discussion-gate.ts`, exported): `isVisibleToViewer(buddyReadId, viewerId, anchor)` plus a batch form used by the list. Visible when the viewer is the author, or has `show_everything`, or the anchor is unlocked: a range unlocks once `end_word <= furthest_word` (the whole passage has been read), a chapter anchor once `start_word <= furthest_word`. Uses only stored positions, never request input. Items from users in a block relation with the viewer are dropped before counting; `hiddenAhead` counts the rest that are gated.
- **Comments**: post (range or chapter anchor, validated against the viewer's linked book: `0 <= start <= end < word_count`, null word count rejected; chapter anchor must equal a `startWord` in its `chapters` JSON), reply (one level; parent must be visible to the replier, no block with the parent's author), edit own body (sets `edited_at`), delete own (hard delete without replies, otherwise body null + `deleted_at`, shown as removed). Rate limits via `checkLimit`.
- **Shared highlights**: share (highlight must exist server-side for the author, `deleted = false`, on the author's linked book, non-null `text`, else a specific error code), unshare (deletes the reference; reactions cascade). Share-all flag on the membership: when on, every live highlight of the linked book is treated as shared; the list lazily inserts reference rows for them so reactions and reports have a stable id; turning it off deletes the reference rows that were not shared individually (with their reactions). Edits and deletes of the highlight come through normal highlight sync automatically.
- **Reactions**: add (insert, conflict ignored) and remove; target must be visible to the reactor and not from a blocked user.
- **List**: `getDiscussion(viewerId, readId)`: comments and shared highlights of current members (shared highlights of leavers disappear; comments of leavers stay), gated, grouped client-side by chapter; authors via `identityOf` (handle, display name, avatar only).
- **Notifications**: reply → `buddy_read_reply` to the parent's author; reaction → `buddy_read_reaction` to the target's author. Collapsed per `(recipient, type, subject)`: the existing row is replaced with the latest actor and a count in the payload. Never for own actions or across a block.
- **Moderation**: two new targets in `moderation/targets.ts` (snapshot: comment body, or highlight snippet + note, plus the buddy-read title); resolve by id requires the reporter to be a member who can see the item. Actions `remove_comment` (placeholder) and `remove_highlight_share` (sets `removed_at`, never touches the author's highlight), plus `suspend_sharing` and `ban`; statement of reasons through the existing decide flow.
- **Account deletion**: `purgeUserSyncData` deletes the user's comments without replies and turns the rest into removed placeholders; reactions and shared-highlight references cascade on the user.
- **Routes** under `api/social/`: `buddy-read-discussion` (GET), `buddy-read-comment`, `-comment-reply`, `-comment-edit`, `-comment-delete`, `-highlight-share`, `-highlight-unshare`, `-reaction`, `-reaction-remove`, `-discussion-settings` (share-all, show-everything).

### 4. App
- `services/social/buddy-read-discussion.ts`: query and mutations under the social key prefix; the share action pushes first (sync), after filling a null highlight `text` from the local book's `WordIndex`.
- **Discussion screen** `/tabs/social/buddy-read/$id/discussion`: grouped by chapter, identity cards, "edited" and "removed" labels, reactions bar, reply/edit/delete, report, states (loading, empty, "N items ahead of you", offline with composing disabled, failed fetch with retry, failed post keeps the draft). Settings row: "Share all my highlights" (confirmation mentioning notes) and "Show everything" (spoiler confirmation), both switchable off.
- **Buddy-read detail**: a Discussion entry with counts; **highlight share** from the book's highlight list and the reader's highlight modal, with a preview of exactly what others see.
- **Reader**: "Comment" in the selection toolbar and "Comment here" at the current position; margin markers beside paragraphs with unlocked items in scroll and page modes; dots on the existing progress-bar marker layer in RSVP; tapping opens a thread sheet.
- **Inbox**: copy for reply and reaction items.

### 5. Docs and tests
- `CONTEXT.md` (buddy-read comment, shared highlight), privacy policy, `docs/social-buddy-reads.md` discussion section.
- `buddy-read-discussion.integration.test.ts`: anchor validation, gating at, before and after the anchor, chapter unlock, monotonic furthest position (jump back, session wipe), own items, override on/off, hidden count, block both ways (visibility, replies, reactions, notifications), non-member and leaver access, unshare, share-all on/off, null highlight text, limits, notifications collapsed, moderation snapshot and takedown, buddy-read deletion cascade; `account-deletion.integration.test.ts` extended.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Decisions
- A range anchor unlocks once its end word is at or before the viewer's furthest word (the whole passage has been read); a chapter anchor unlocks at the chapter's start word.
- Replies copy the parent's anchor, so gating never joins to the parent.
- "Share all" is materialized lazily: the discussion fetch inserts reference rows for the author's live highlights so reactions and reports have a stable id; turning it off deletes the implicit rows (and their reactions).
- A takedown sets `removed_at` on the share reference and bars re-sharing that highlight; the author's own highlight is never touched.
- Reply and reaction notifications collapse per (recipient, type, subject): the previous row is replaced by the latest actor with an "and N others" count.
- The discussion has its own route, `/tabs/social/buddy-read-discussion/$id`, linked from the buddy-read detail screen and the inbox.
- AC21: better-auth `/delete-user` and `/admin/remove-user` are disabled since TASK-171.13, so every deletion path (in-app, admin `deleteAdminUser`) goes through `deleteUserAccount` → `purgeUserSyncData` → `purgeDiscussionOf`. Covered in `account-deletion.integration.test.ts` and in the discussion integration test.

## Verification
- Web 167 tests (discussion suite 14, account-deletion purge test added), core 127, app 664; tsc clean. Migration 0028 applied to the dev and phone test databases.
- On device (Android, two accounts): gating with hidden count, posting at position, posting from a text selection, replies, reactions, inbox items for reply and reaction on the other account, progress-bar ticks and paragraph marker with thread sheet, sharing a highlight from the highlight modal with preview; the other account sees the new comment and shared highlight through the API. Page and RSVP modes were not exercised on device.

## Found during device test (pre-existing, not from this task)
- `pages/reader/paragraph.tsx` arms a one-shot click swallower after a long press, but Android WebView sends no trailing click after a long press, so the swallower eats the next real tap: the first tap on any selection-toolbar button (colour, note, comment) does nothing.

## Review pass (4 agents)
- Server: the author check on replies, reactions and `isVisibleToViewer` now uses `canSeeAuthor` (banned or handle-less authors and blocks either way), matching the discussion list; before, a banned author's comment still took replies and reactions by id.
- Server: the "and N others" count on reply and reaction notices leaves out people in a block relation with the recipient.
- Server: `postComment` refreshes the furthest word like the other paths.
- Schema: index on `buddy_read_comment.parent_id` (reply counts on delete, takedown and purge), added to 0028 and created by hand on the dev and phone databases.
- App: the reader's thread sheet derives its items from the live query, so a reply or reaction made in the open sheet shows up; the share action writes the previewed note and colour before pushing; comment textareas are disabled offline.
- Tests: ban gate and block-aware notice count. Web 168, core 127, app 664.
- Not changed: per-route rate limits for delete/share/settings/fetch stay inline (repo convention); rate limits are only enforced in routes and not covered by tests, like the other social routes; `removeReaction` stays ungated because it only deletes the caller's own row.

## Review pass (2 agents, follow-ups)
- Reverted the share action's colour/note rewrite: it stamped possibly stale values with a fresh `updatedAt`, which last-write-wins sync could push over a newer edit from this or another device. The share action again only fills missing text, and now invalidates the book's highlight query after doing so.
- Comment textareas are no longer disabled offline (a network blip would blur the field and drop the keyboard); only the submit button is.
- The reader's thread sheet closes when all of its items are gone instead of staying open empty.
- The "and N others" notice count now leaves out banned and handle-less people as well as blocked ones, matching the discussion list (`visibleToRecipient`).
- `isVisibleToViewer` takes `now` like the rest of the module.
- Tests: reply and reaction notice counts with a blocked and a banned participant; the block test cleans up its block. Web 173, app 671.
- The reader files (index.tsx, selection toolbar, highlight modal) are being reworked in TASK-172 in parallel; the share entry point moves from the highlight modal to the selection toolbar there.

## Decision (2026-09-27)
Asked whether sharing a single highlight duplicates commenting on a selected passage. Decision: keep both as they are (private highlights, individual share, share-all, and comments).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adds the buddy-read discussion: spoiler-gated comments anchored to a passage, the reader's position or a chapter, one-level replies, edit and delete, shared highlights (individually after a preview, or all via an opt-in toggle), emoji reactions, reply and reaction inbox items, reporting and takedown, block handling, rate limits, and account-deletion purge.

Server: migration 0028 (comment, shared-highlight reference and reaction tables; `furthest_word`, `share_all_highlights`, `show_everything` on the membership), `discussion-gate.ts` with the exported `isVisibleToViewer`, `buddy-read-discussion.ts`, ten `api/social/buddy-read-*` routes, two moderation target types with their takedown actions, inbox subjects, and `purgeDiscussionOf` in `purgeUserSyncData`.

App: discussion screen (grouped by chapter, states, settings toggles with confirmations), buddy-read detail entry, reader paragraph markers and progress-bar ticks with a thread sheet, "Comment" in the selection toolbar, "Share to the buddy read" in the highlight modal (fills missing text and pushes first), inbox copy.

Docs: CONTEXT.md, privacy policy, docs/social-buddy-reads.md.

Tests: 14 discussion integration tests plus a purge test in account-deletion; all suites green; verified on an Android device with two accounts.
<!-- SECTION:FINAL_SUMMARY:END -->
