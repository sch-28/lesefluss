# CONTEXT: Domain language

Shared vocabulary for this codebase. Use these terms exactly in code, commits, PRs, ADRs, and chat. Words drift, code rots, this file is the canonical reference.

If a term you need is missing, add it here before introducing it in code.

---

## Reading

### Book

A self-contained text the user reads. Has metadata (title, author), a body, and optionally chapter boundaries. A `book` in the database is the lesefluss-side record. The same logical book on a device is identified by a device-specific hash.

### Library

The set of books on a given surface. The app has a library (in IndexedDB). The rsvpnano device has its own library (on SD card). Each library has its own identity scheme. They are correlated by deterministic filenames (see *book identity mapping*).

### Position

The reader's location in a book. The canonical app-side unit is **word position** — a zero-based index into the book's tokenized word stream. The lesefluss esp32 firmware still speaks byte offsets; conversion happens at that BLE seam, not in the middle. The rsvpnano speaks word index natively. See ADR-0002.

### Word position

A zero-based index into the book's tokenized word stream. The canonical position unit across the app: `books.wordPosition`, highlights, reading sessions, chapter starts, and all cross-device sync ship this unit. Convertible to a UTF-8 byte offset only via the book's `WordIndex`.

### Position unit

The unit a given surface speaks at the BLE seam. Two values exist: `"byte"` (lesefluss esp32) and `"word"` (rsvpnano, cloud sync, all app-side storage). Derived from the device descriptor (`services/devices/capabilities.ts`). Not a runtime mode for the app — the app is always `"word"`. The unit only varies at the device boundary.

### Word index

The precomputed mapping between a book's word positions and the underlying content. Per-book, persisted in `book_content.wordIndex`. Built once from `book_content.content` using the canonical [tokenization rule](#tokenization-rule). Answers: which word starts at byte N, what byte does word K start at, how many words between two positions. Invalidated (nulled) when the book's content changes.

### Tokenization rule

The canonical word-splitting rule used to build a [word index](#word-index). Defined once in `@lesefluss/core` and shared by every consumer (reader, sync, highlights, sessions, conversion helpers). Current rule: split on `/(\s+)/` over UTF-8 plain text; preserve hyphenated and dash-joined sequences as single words; mark a word `breakBefore` when preceded by two or more newlines. Soft hyphens, em-dashes, and en-dashes do not split words. The rule is what makes two word positions over the same content portable.

### Highlight anchor

The position pair identifying a highlight in a book. Shape: `{ startWord, startCharInWord, endWord, endCharInWord }` — Option A. Word position pins the token; char-in-word preserves sub-word selection (rare, but cheap to keep). See ADR-0002.

### Session

A continuous reading session: start, end, words read, target book. Lives in the local database. Syncs to the server.

*Words read* (`reading_sessions.wordsRead`) is the total length of the [read spans](#read-span), not the distance between start and end position.

### Read span

A range of the book travelled forward at reading pace within one [session](#session). Movement above the mode's per-tick threshold is a jump (TOC navigation, a progress-bar scrub) and crosses its range without reading it; moving backwards reads nothing, though the range is credited if it is later travelled forward again.

Spans are merged, so a passage re-read in the same sitting counts once, while a gap skipped earlier and read later does count. They are a tracker-internal accounting device: never persisted, never synced. Only their total length is stored.

---

## Social

### Handle

A user's unique, human-readable social identity, shown as `@handle`. 3 to 20 characters from
`[a-z0-9_]`, stored lowercase, unique case-insensitively (the `social_handle` primary key). A user
without a handle is invisible to every other user and cannot use social features. Handles are not
searchable and appear in no URL; people connect only through invite links and in-app requests.
Changeable once every 30 days. A released handle (change, account deletion, admin reset) is held for
90 days, during which only the previous owner may reclaim it, and not even they after an admin reset.

### Identity card

The always-visible part of a profile: handle, display name (`user.name`) and avatar. Shown wherever
another user legitimately encounters you (friend requests and lists, invite pages, buddy-read
participants, shares). Not affected by [profile visibility](#profile-visibility).

### Profile visibility

A user's server-side setting for everything beyond the [identity card](#identity-card): `private`
(default: bio and profile sections visible only to the owner) or `friends` (accepted friends see the
bio and the sections whose per-section toggle is on: currently reading, finished books, reading
stats, shared highlights). There is no public level. A section is shown only if both the visibility
and its toggle allow it.

### Friend

Two users who both consented: one sent a friend request and the other accepted it, or one opened
the other's invite link and confirmed. Stored once per unordered pair (`social_friendship`). Every
friend-scoped feature (profiles, sharing, buddy reads) checks this together with the block and ban
gate; there is no follow relationship and no public friend list.

### Friend request

A pending ask from one user to another, sent only to a co-participant of a shared active buddy
read. Expires 30 days after it was sent. Declining is silent: the sender keeps seeing "pending"
until expiry and a repeat request within 90 days of the decline is accepted but never shown to the
addressee. Mutual requests become a friendship without an accept.

### Block

A one-directional, private mark that ends and prevents all interaction with another user: it removes
the friendship and open requests, and makes each side "not found" to the other in every social
endpoint. The blocked user is not told. Unblocking restores nothing. Books already delivered by a
share stay with their recipient.

### Invite link

A user's single personal URL (`/invite/<token>`) that anyone can open to become their friend.
Multi-use, expires after 14 days, revocable, and replaced whenever a new one is created. Opening it
shows only the owner's [identity card](#identity-card); confirming creates an accepted friendship
at once, because the owner consented by handing the link out. It is the only way to reach a user
outside a shared buddy read: there is no search and no directory.

### Inbox

The signed-in user's list of social events that concern them, stored server-side as
notifications (`social_notification`): what happened, who did it, when, and a single `read_at`.
Only events the other side would expect the user to learn about exist as types; declines,
removed friendships and blocks never produce an item. Actionable items (a friend request, later a
share or buddy-read invite) resolve their state live from the underlying row, so one resolved
elsewhere shows as resolved. A request the user accepted or declined stays as a read item; one
that was cancelled, expired or whose friendship ended disappears. The unread count drives the
Social tab badge. Retention: read items 90 days after reading, all items 365 days after creation.

### Hide from profile

A per-book flag (`books.hide_from_profile`, `sync_books.hide_from_profile`) the owner sets in the
book edit sheet. A hidden book appears in no profile section for any viewer and its sessions are
left out of the profile stats. Private: it rides the metadata revision across the owner's devices
but travels to nobody else, and a shared copy starts visible. Merged on its own rule, so a client
that predates the flag can never clear it.

### Share

An offer of one synced, standalone book from its owner to one accepted friend (`social_share`).
Pending for 30 days, then expired; the sender can revoke it, the recipient accept or decline, and
a decline is never shown to the sender. Accepting copies the sender's row server-side into the
recipient's library with a fresh book id ([content origin](#content-origin) inherited), or links
to a copy the recipient already holds. The copy is then the recipient's: only a
[takedown](#takedown) removes it. At most one open offer per sender, recipient and origin; 20
shares per sender per day; the first share records a one-time rights confirmation. Refused for
non-friends, suspended senders, local-only, unsynced, deleted or series books and taken-down
origins.

### Buddy read

A group of up to 8 people, host included, reading the same [content origin](#content-origin)
together (`buddy_read`, `buddy_read_member`, `buddy_read_invite`). The host invites accepted
friends; pending invites count toward the 8 and void when the read ends or finishes, the inviter no
longer counts, the friendship ends or 30 days pass. A joiner is linked to their own live copy of
the origin, or receives one through the same copy as a share. A current member is active with a
live linked book: a tombstoned, deleted or wiped book counts as having left. Members see each
other's percent, chapter, words ahead or behind (hidden as approximate when word counts differ)
and last active time, with no friendship needed, unless a block or ban hides one from the other.
Co-members may send each other friend requests. The host is the stored host while they count,
else the earliest-joined member; the read is deleted with its last member. A member finishes the
first time their pushed position reaches the finished threshold after having been below it since
joining; the read finishes when every member has, and then stays listed read-only.

### Buddy-read comment

A comment in a [buddy read](#buddy-read), anchored to a passage (word range) or to a chapter's
start (`buddy_read_comment`). Replies are one level deep and take over their parent's anchor. A
member sees a comment only once their **furthest position** (the highest position ever synced or
read in a session, never lowered) has passed the end of the passage or reached the chapter;
their own items and a per-read "show everything" override skip that gate. Deleting a comment that
has replies leaves a removed placeholder. Comments of members who left stay; a comment's author
may still delete it.

### Shared highlight

A reader's own highlight made visible to others. In a buddy read it is a reference to the
author's highlight (`buddy_read_shared_highlight`), shared one by one or all at once with the
per-read "share all my highlights" setting, and always shown with its note. Edits and deletes of
the highlight through sync show up there; unsharing removes it and its reactions. A takedown
removes the share, never the highlight, and bars sharing it again. Profile sections (TASK-61)
use the same term.

### Content origin

The `(origin_user_id, origin_book_id)` on every `sync_books` row: the row itself for an upload,
the first uploader's row for every copy made from it (a copy of a copy keeps the first origin).
Server-authoritative, backfilled for existing rows, never set by a push; a `sync_book_copy`
record lets a copy keep its origin when it is pushed back after Clear cloud data. Clients receive
only `originKey`, an HMAC of the pair: equal keys mean the same word stream, which is what buddy
reading needs (ADR-0002, ADR-0004), and nothing about who uploaded it.

### Notice

A report (DSA Art. 16) that a profile or a shared book is illegal or breaks the terms, filed in the
app by a signed-in user or on the public `/report` form by anyone. Stored in `social_notice` with a
text snapshot of the target at report time, the notifier (account, or typed name and email), the
reason and explanation, and later the decision. Every notice is decided by an admin: rejected, or
actioned with one restriction. The reported user never learns who notified; the notifier learns the
outcome. Closed notices are deleted 24 months after the decision; notices outlive both accounts.

### Takedown

The removal of a synced book because of a notice: the row is tombstoned like an admin delete and a
`social_takedown` record is written for the `(user, book)`. The sync push drops any book with a
record, so a device that was offline cannot bring it back, even after the tombstone itself was
cleaned up. Scope `copy` removes the reported copy; scope `origin` (book sharing) removes every
copy of a source book and blocks sharing it again.

### Sharing suspension

A restriction (`social_restriction`, kind `sharing_suspended`) that stops a user from
sharing books, starting buddy reads or sharing highlights, for 7 days, 30 days or until lifted.
Reading, sync and existing friendships continue and friends never learn of it. Imposed by an admin
on a notice, or automatically when three notices against the user were upheld within 180 days.
Expiry is a timestamp comparison at read time (`isSharingSuspended`); no job lifts anything. Every
restriction comes with a statement of reasons (DSA Art. 17) by email and inbox item.

---

## Storage

### Chunked column

A large TEXT column in `book_content` (`content`, `wordIndex`) read and written in
bridge-sized pieces rather than one value. Moving a multi-megabyte string across the Capacitor
SQLite bridge in a single statement OOMs the native side (`JSONObject.toString` on the whole
param/result). The chunked-column module (`services/db/long-text.ts`) appends with
`SET col = col || ?` and reads with `substr`/`length`, capped at a fixed character count per
round-trip. See ADR-0003.

### Local-only book

A book whose plain-text `content` exceeds [`MAX_SYNCED_CONTENT_BYTES`](packages/core/src/sync.ts)
(20 MB). It is stored and read on the importing device but excluded from cloud sync: its content
and wordIndex would exceed the bridge and server-body limits, and its wordIndex is not persisted
(rebuilt on open). Eligibility is a pure function of `books.size` via `isSyncEligible(book)`; there
is no separate flag. See ADR-0003.

---

## Devices

### Reader device

An external hardware device that can display book text. Two exist today:

- **lesefluss esp32**: our button-only RSVP reader. Single book at a time. Single-book BLE schema.
- **rsvpnano**: third-party touchscreen ESP32-S3 reader. Multiple books on disk. Multi-book BLE schema. Source: `apps/rsvpnano` (submodule, MIT).

The esp32 stays single-book (see ADR-0001).

### Device descriptor

The typed declaration of how to talk to a class of device over BLE. Lives in `services/devices/<kind>/`. Contains: service UUID, per-characteristic UUID + JSON codec + access mode, optional transfer-channel config. The descriptor *is* the protocol surface for that device.

### BLE transport

The generic, descriptor-driven module that turns a descriptor into a typed adapter. Owns chunked transfer, ACK queue, connection lifecycle, JSON encoding. One implementation, two consumers. Lives at `services/ble-transport/`.

### Codec

The encode/decode pair attached to each characteristic in a descriptor. Operates at the JSON layer (typed payload ↔ DataView). Per-characteristic, declared in the descriptor.

### Device capabilities

Derived flags describing what a connected device can do. Derived from the descriptor (presence of a characteristic implies a capability). Surfaced to UI via `useDeviceCapabilities()`. No separate capabilities object exists. The descriptor *is* the capability source.

### DeviceSync

The capacitor-app UI component that dispatches between device-specific sync flows. Reads capabilities, renders `<SingleBookSync>` or `<MultiBookSync>`. Routes mount `<DeviceSync>` and never know which kind of device is connected.

### Book identity mapping

The convention by which a lesefluss book (UUID-keyed) correlates with the same book on a device (hash-keyed). The app uploads books with the filename `{lesefluss-uuid}.rsvp` so the device-side FNV-1a hash of the SD path is reproducible client-side without a lookup.

---

## Packages

### `@lesefluss/ble-config`

Source of truth for BLE protocol constants. Two JSON files, two TS namespaces:

- `config.json` plus the `singleBook` namespace cover the lesefluss esp32 schema.
- `config-multibook.json` plus the `multibook` namespace cover the rsvpnano schema.

Code generators (`generate-py.ts`, `generate-cpp.ts`) read the JSON files to emit firmware-side constants for the esp32 (Python) and rsvpnano (C++) respectively.

### `@lesefluss/book-import`

Source-side parsers that turn external book formats (EPUB, web pages, etc.) into the app's internal book shape. Import-shaped only. Export to device formats lives at the call site, not here.

---

## What this file is not

- Not API docs. Per-module docs live with the module.
- Not a changelog. Decisions go in `backlog/decisions/`.
- Not exhaustive. Add terms as they earn their place.
