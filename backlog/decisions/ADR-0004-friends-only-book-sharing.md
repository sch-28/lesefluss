# ADR-0004: Friends-only book sharing by server-side copy, with notice-and-takedown

Date: 2026-09-26
Status: Accepted

## Context

The social workstream (friends, profiles, buddy reading) needs two readers to hold *the same* book.
Progress comparison is only meaningful when both sides tokenize identical content, because a
[word position](../../CONTEXT.md#word-position) is an index into one specific word stream
(ADR-0002). Two independent imports of "the same" book do not guarantee that: book IDs are random
(`packages/book-import/src/utils/id.ts`), nothing hashes content, and a different edition or parser
version yields a different word stream.

Milestone m-6 previously ruled out sharing user-uploaded files ("personal-cloud-locker territory")
for copyright reasons. We re-examined that:

- Under the EU Digital Services Act a platform storing user content is a hosting provider (Art. 6).
  It is not liable for content it has no knowledge of, provided it acts expeditiously once notified.
  It must offer an electronic notice mechanism to anyone (Art. 16) and give the affected user a
  statement of reasons when it removes content (Art. 17).
- The stricter DSM Directive Art. 17 regime (German UrhDaG) targets services that give *the public*
  access to uploaded works. A 1:1 share to a named, mutually-accepted friend is not public access.
- Alternatives considered and rejected for now:
  - **Full end-to-end encrypted sync.** Would make the server a blind conduit. Costs: key recovery
    for OAuth users, device key handover on login, a migration, and moving the SQL merge
    (`sync-book-upsert.ts`) to clients. Disproportionate to the legal gain for a private feature.
  - **E2E only for the transfer.** The recipient's copy lands in their plaintext sync anyway.
  - **Server key in an env var.** At-rest protection only; the operator can still read everything,
    so it changes nothing about the hosting-provider position.
  - **OS share sheet with the original file.** Keeps us out of hosting, but the web build has no
    original file and a re-import can tokenize differently.

## Decision

**A user may share a synced book with one accepted friend at a time. Sharing copies the sender's
`sync_books` row server-side into the recipient's account.** No public links, no forwardable URLs,
no shares to non-friends, no sharing of books that are not synced.

- The copy carries content, cover, chapters, link ranges, and bibliographic metadata (title, author,
  description, language, source, catalogId). It never carries the sender's private fields
  (position, status, rating, review, tags, notes, highlights, glossary, finishedAt, reading
  sessions, hide-from-profile flag) or the source URL, which may be a private link.
- The recipient's row gets a fresh server-generated `bookId` unique within their account. The
  recipient's existing sync pull materialises it like any server-side book (no new client path).
- Every copy records its **content origin**: the `(userId, bookId)` of the row the content was first
  imported into. A copy of a copy inherits the original origin. Two books with the same origin have
  byte-identical content and therefore comparable word positions. This is the book identity used by
  buddy reading. No content hashing is introduced.
- Catalog books (Gutenberg / Standard Ebooks) use the same mechanism. There is one sharing path, not
  two; the archived "share public-domain books from catalog" task is subsumed.
- **Profiles are friends-only, and there is no user discovery.** A profile is private or visible to
  friends; there is no public profile, no handle search, no directory and no suggestions. Friends
  connect only through a personal invite link or an in-app request to a co-participant of a shared
  buddy read. This keeps all social data non-public, so the service stays a plain hosting provider
  rather than a platform that disseminates content to the public.
- **Notice-and-takedown** is mandatory before sharing ships: an in-app report action on received
  shares and profiles, a public web notice form, an admin queue, a removal action that tombstones
  the shared copies (sync propagates the deletion) and keeps a removal record so an offline device
  cannot push a removed copy back, a statement of reasons to the sender, and suspension of sharing
  for repeat offenders.

## Reasons

- **Identical content by construction.** Copying the row is the only option that guarantees both
  readers tokenize the same bytes, so buddy-read positions compare exactly with no fuzzy matching.
- **Reuses the sync restore path.** The server already restores books a device does not have
  (`addServerBookWithContent`); a share is just a row appearing server-side.
- **Proportionate legal posture.** Private 1:1 sharing between accepted friends plus a working
  notice mechanism keeps us inside hosting-provider safe harbour without E2E's UX costs.
- **Origin over hash.** Origin is exact, free to compute, and survives tokenizer changes (both copies
  re-tokenize the same content). A hash would be needed only for books imported independently,
  which buddy reading deliberately does not support.

## Consequences

- Only books within `MAX_SYNCED_CONTENT_BYTES` (ADR-0003) can be shared, because only those exist
  server-side. Local-only books show why sharing is unavailable.
- Buddy reading requires every participant to hold a copy with the same origin. Joining a buddy read
  delivers a copy to participants who do not have one.
- Shared copies count against the recipient's storage (TASK-123 quota, when it lands).
- Takedown has to find every copy of a content origin; origin is indexed for that reason.
- We are a hosting provider for shared content and must keep the notice mechanism, contact point,
  and terms current.

## Not revisiting

Architecture passes should not re-propose:

- Public or link-based book sharing.
- Public profiles or searchable handles.
- Fuzzy position matching between independently imported books for buddy reading.
- Content hashing as book identity for sharing (origin covers it).

Reopen only if: legal advice says 1:1 sharing needs E2E, sharing volume makes takedown handling
unmanageable, or we decide to advertise "we never see your books" as a product feature (then see
the E2E option above).
