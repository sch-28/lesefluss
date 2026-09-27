---
id: TASK-61
title: Share highlights and notes with friends and as quote cards
status: To Do
assignee: []
created_date: '2026-04-26 15:59'
updated_date: '2026-09-25 22:55'
labels:
  - social
  - app
  - web
milestone: m-6
dependencies:
  - TASK-171.5
  - TASK-171.6
  - TASK-171.10
documentation:
  - backlog/decisions/ADR-0004-friends-only-book-sharing.md
priority: medium
ordinal: 10600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of the social workstream (parent TASK-171). Let a reader share a highlight (a short quote plus an optional note) with their friends, on their profile and in friends' feeds, and export a highlight as an image or text card to share anywhere. Shared highlights are friends-only: profiles have no public option (ADR-0004), so a share never reaches strangers or signed-out visitors. The working legal assumption is that short, attributed snippets are covered by the §51 UrhG quotation right, so shared text stays short, is always attributed, and shares cannot reproduce large parts of a book (caps below).

Depends on TASK-171.5 (visibility resolver, per-book "hide from profile" flag, the in-app profile screen that gets a "shared highlights" section here), TASK-171.10 (feed event types) and TASK-171.6 (report targets, takedown, statement of reasons, `sharing_suspended` restriction). Shared highlights are user content shown to friends, so notice-and-takedown must be live first (ADR-0004). Buddy-read highlight sharing is TASK-171.9.

Scope:
- **Share**: from an existing highlight (reader highlight modal, annotations sheet, book highlights list) choose "Share". The dialog previews exactly what friends will see (snippet, attribution, note if included), states the audience ("Your friends") and offers "include note" and "mark as spoiler", both default off. Confirming creates a server-side share record referencing the user's own `sync_highlights` row; the highlight is unchanged. A shared highlight shows a "Shared" state with Edit (the two options) and Unshare, which deletes the share record only.
- **What friends see**: a "shared highlights" section on the in-app profile (TASK-171.5), newest first, with snippet, attribution, note if included and share date, and a "shared a highlight" feed event rendered the same way. Spoiler-marked items show attribution with snippet and note blurred until tapped. The owner sees an empty state ("Share a highlight from any book"); other viewers do not see an empty or disallowed section. Viewers cannot open the book; no comments or reactions.
- **Visibility**: resolved at read time by TASK-171.5 (profile visibility private or friends × section toggle × viewer relation, blocks either way, banned owner) plus the per-book hide flag. Only friends can ever see shares; strangers and blocked users get "not found" for the profile. Making the profile or section visible to friends later also exposes earlier shares. There is no per-share audience.
- **Caps**: a snippet over 300 characters (after stripping markup and collapsing whitespace) cannot be shared, and a user can have at most 20 active shares per book; the UI explains either limit. Notes keep the existing 2,000-character sync limit. Attribution (title, author) is always shown.
- **Preconditions**: signed in with a social handle (TASK-171.1), a synced book (not local-only, ADR-0003), highlight sync on, online, and no active `sharing_suspended` restriction. Otherwise the share action is disabled with the reason. Export has none of these preconditions.
- **Errors**: a failed or rejected share (network, cap, highlight not yet on the server, rate limit, suspension) shows a message and keeps the dialog open for retry; nothing is queued offline.
- **Quote card export**: render the highlight as an image (quote, title, author, Lesefluss branding, note only if "include note" is ticked, default off) or plain text with attribution, and hand it to `@capacitor/share` on native, or the Web Share API with files where supported and a download otherwise. This is the user's own act of sharing outside the app, so it is not limited to friends. The card never contains the user's name, handle or email. The image card uses the same 300-character cap (longer highlights offer text only); text export is uncapped, like the existing export. Works offline and without an account, and creates no server record.
- **Settings warning**: turning highlight sync off while having shared highlights asks for confirmation that the shares will be permanently removed.
- **Deletion**: unsharing, deleting the highlight, deleting the book, "Clear cloud data" and account deletion remove the share from profile and feed.
- **Moderation**: shared highlights can be reported in the app and through the TASK-171.6 web notice form; takedown removes the share, never the private highlight.

Out of scope: sharing into a buddy read (TASK-171.9), 1:1 sharing to one friend, comments or reactions on profile highlights, any public or anonymous viewing of shared highlights (no public profiles, no public links to a single highlight), per-share audiences.

Implementation notes (verified against the code):
- **Reference, not copy.** New Postgres table (`apps/web/src/db/schema.ts`, generated migration in `apps/web/drizzle/`, latest `0020_book_added_at.sql`) with `(user_id, highlight_id, include_note, is_spoiler, created_at, updated_at)`, primary key `(user_id, highlight_id)` so double-sharing is idempotent, no FK to `user`. At read time join `sync_highlights` on `(user_id, highlight_id)` and `sync_books` on `(user_id, book_id)`, dropping rows where either is missing or `deleted = true`. This matches TASK-171.9 and TASK-171.10, and makes highlight delete, book delete, `deleteAdminBook` (`apps/web/src/lib/admin.ts`) and TASK-171.6 book takedown hide the share with no extra code. Edited notes show live.
- **Highlight push is full-set.** `api/sync.ts` tombstones every server highlight the push omits; a client with `syncHighlights` off, or a local-only book (filtered by `pushedBookIds` in `apps/capacitor/src/services/sync/index.ts`), pushes none. Delete share rows whose highlight was tombstoned in the same push transaction, after the tombstone step, so a re-pushed highlight id does not revive its share. That is why `routes/tabs/settings/sync.tsx` needs the warning.
- **Server-side first.** A new highlight reaches `sync_highlights` only on the next push, so the client pushes (or waits for one) before sharing; the endpoint returns a distinct error for an unknown or tombstoned highlight.
- **Snippet text.** `text` is null for highlights created before the column existed. Decision: before the push, the client fills a missing local `text` from the local book content with `WordIndex` (`@lesefluss/core`) and the highlight's anchors; the push upsert keeps server text via `COALESCE(excluded.text, sync_highlights.text)`, so it reaches the server. The share endpoint rejects a still-null `text`. Export derives text locally the same way. Strip tags (as `services/export/index.ts` does) before measuring and rendering. Enforce both caps on the server at share time and the snippet cap again at read time.
- **Series chapters.** For `sync_books.series_id` non-null, attribution is the `sync_series` title and author plus chapter number, as `getDisplayTitle`/`getDisplayAuthor` in `apps/capacitor/src/services/export/index.ts` do. Reuse them for the card.
- **Endpoints.** Share (create or update options), unshare and "my shared highlights" under `apps/web/src/routes/api/` with `middleware: [cors, requireAuth]`, `checkLimit` (`apps/web/src/lib/rate-limit.ts`) keyed `highlight-share:${userId}` (default 30 calls per hour), plus the handle and `sharing_suspended` checks. The app calls them through the shared authed-fetch helper extracted from `syncFetch` (bearer on native, cookie on the web build). Other users' shares are served only through the authenticated TASK-171.5 profile API and the TASK-171.10 feed, never in website HTML. Spoiler blur is client-side courtesy, not access control.
- **Feed event.** The TASK-171.10 event carries only the highlight id (no text copy), is dropped at read time when the share row is gone, and is not re-emitted when options are edited.
- **Purges.** Delete the user's share rows in `purgeUserSyncData` (`apps/web/src/lib/account-deletion.ts`, reached by all three deletion paths once TASK-171 switches `deleteAdminUser` over) and in `clearCloudData` (`apps/web/src/lib/profile.ts`), which deletes `sync_highlights` directly; otherwise a re-push would resurrect shares. Extend `account-deletion.integration.test.ts`.
- **Moderation.** Add "shared highlight" as a TASK-171.6 report target and admin queue item; the notice snapshots snippet and note as reported. Takedown deletes the share row and sends the statement of reasons.
- **Quote card rendering.** No DOM-to-image library is installed; draw on a `<canvas>` (await `document.fonts.ready`, wrap lines, respect RTL). Native: write the PNG with `Filesystem.writeFile` to `Directory.Cache` and pass the URI to `Share.share`, like `shareFile` in `services/export/index.ts`. Web (`IS_WEB`, `utils/platform.ts`): `navigator.share({ files })` when `navigator.canShare` allows, else `downloadBlob`.
- **Rollout.** Server-only table, no sync payload change, so older app builds are unaffected.
- **Docs.** In `apps/web/src/routes/privacy/index.tsx`, add shared highlights as shared data: what is shown (snippet, attribution, optional note), who sees it (friends only, per profile visibility and section toggle), how it is removed, and that card export happens on the device. Define the term in `CONTEXT.md` together with TASK-171.9's buddy-read shared highlight.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A signed-in user with a handle can share an existing highlight of a synced book from the reader highlight modal, the annotations sheet and the book highlights list, after a preview showing the snippet, attribution, the note if included and the audience (their friends)
- [ ] #2 The note is excluded and the spoiler mark is off unless the user turns them on, and both options can be changed or the share removed from the Shared state
- [ ] #3 When the user is signed out, has no handle, the book is local-only, highlight sync is off, the device is offline, or sharing is suspended, the share action is disabled with the reason shown
- [ ] #4 A failed or rejected share (network error, over a cap, highlight not on the server, rate limited) shows a message and keeps the dialog open for retry
- [ ] #5 Shared highlights appear on the user's in-app profile and in friends' feeds only for friends, and only where profile visibility, the shared-highlights section toggle, the per-book hide flag, block state in either direction and ban state allow, enforced server-side
- [ ] #6 Strangers, blocked users and signed-out visitors never see shared highlights, and shared highlights never appear in website HTML
- [ ] #7 The owner sees an empty state in their shared-highlights section; other viewers do not see the section when it is empty or not allowed
- [ ] #8 A spoiler-marked highlight shows its attribution with snippet and note hidden until the viewer taps to reveal
- [ ] #9 Highlights whose tag-stripped text exceeds 300 characters, and shares beyond 20 active per book, are rejected by the server regardless of the client, and the UI explains the limit
- [ ] #10 A highlight created before the text column existed can be shared once its text has been filled from the local book content
- [ ] #11 Every shared quote and quote card shows the book title and author (series title and chapter number for serial chapters)
- [ ] #12 Editing the note of a shared highlight that includes its note updates what friends see
- [ ] #13 Unsharing, deleting the highlight on any device, deleting the book, Clear cloud data, turning highlight sync off, or deleting the account removes the shared highlight from profile and feed, and a later push of the same highlight id does not bring it back
- [ ] #14 Turning highlight sync off while having shared highlights asks for confirmation that the shares will be removed
- [ ] #15 A user can export any highlight as an image card (within the snippet cap) or attributed text via the OS share sheet on native and the Web Share API or a download on web, offline and without an account; the card contains no name, handle or email and includes the note only when chosen
- [ ] #16 Shared highlights can be reported in the app and through the web notice form, and a takedown removes the share (not the private highlight) and sends the owner a statement of reasons
- [ ] #17 The share endpoints accept both the bearer token (native) and the session cookie (web build) and are rate-limited per user
- [ ] #18 Tests cover the snippet and per-book caps, the visibility matrix including blocks, strangers and signed-out requests, removal on highlight tombstone, book tombstone and Clear cloud data, and the account-deletion purge in account-deletion.integration.test.ts
- [ ] #19 The privacy policy and CONTEXT.md describe shared highlights, including that only friends can see them and that the note is shared only when chosen
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cross-task contracts (from the final review of the TASK-171 set):
- **Feed event recording** follows TASK-171.10's rule: record the "shared a highlight" event only while the owner's feed publishing is on and the shared-highlights section is visible to friends at that moment. The event's `payload` holds the highlight id, and the feed renders the spoiler flag (blurred until tapped) the same way the profile does.
- **Profile section**: TASK-171.5's resolver treats sections as an extensible list and TASK-171.1 already stores the shared-highlights toggle, so this task adds the section without changing the visibility matrix.
- **Moderation**: register "shared highlight" as a report target type through TASK-171.6's extensible notices store (snapshot: snippet and note as reported), add it to the `/report` form's location options and the admin queue, and use its statement-of-reasons flow. `isSharingSuspended` (TASK-171.6) gates the share action.
- **Deletion mechanism**: share rows have no FK to `user` because they are keyed to the user's sync highlights; they are purged in `purgeUserSyncData` (reached by all three paths since TASK-171.1 switched `deleteAdminUser`) and in `clearCloudData`, as the Purges note says.
- **Glossary**: one "shared highlight" entry in `CONTEXT.md` covers both this task and TASK-171.9. The null-text rule (the client fills text before the push, the server rejects null) is the same in both. The 300-character cap applies only here; buddy-read shares in TASK-171.9 are deliberately uncapped because they reach only the closed group reading the same copy.
<!-- SECTION:NOTES:END -->
