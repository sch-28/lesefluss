# CONTEXT: Domain language

Shared vocabulary for this codebase. Use these terms exactly in code, commits, PRs, ADRs, and chat. Words drift, code rots, this file is the canonical reference.

If a term you need is missing, add it here before introducing it in code.

---

## Reading

### Book

A self-contained text the user reads. Has metadata (title, author), a body, and optionally chapter boundaries. A `book` in the database is the lesefluss-side record. The same logical book on a device is identified by a device-specific hash.

### Library

The set of books on a given surface. The app has a library (in its local SQLite database). The rsvpnano device has its own library (on SD card). Each library has its own identity scheme. They are correlated by deterministic filenames (see *book identity mapping*).

- **Local store**: where the app keeps its SQLite database. Android: the native plugin. Web: OPFS, run in a worker. The **legacy store** is the web's older jeep-sqlite copy in IndexedDB: moved to OPFS on the first start (deleted only after the move is verified), and still used where OPFS is missing or the move failed. Where neither works (some private windows), the app shows a full-page screen explaining what to do instead of the library.

- **Library filter**: what narrows the app's library view, together with the search text. Per **facet** (status, tag, author, series, collection, rating, progress, time left, added, last read) it holds the values a book must carry one of (*included*) and the values it must carry none of (*excluded*); tags can instead require *all* included values, which falls back to *any* once no tag is included. A **Length** range in words (inclusive at both ends) sits beside the facets. Ratings file under whole stars (3.5 counts as 4); dates and progress are buckets. Shown as removable chips, also typed as search tokens (`tag:`, `in:`, `words:<50k`). Kept on the device and in the library URL (`f`), not synced. The model lives in `pages/library/filter-model.ts`.
- **Collection**: a named group of books the reader makes by hand. A book can be in several. An *ordered* collection keeps a number (#N) per book and lists by it. Synced; a removed book or deleted collection is a tombstone.
- **Series collection**: an ordered collection with a series key. It forms by itself once two books name the same series in their files, or when the reader makes a new series. Later books of that series join it, unless the reader took the book out of it (a dismissal, which no import or sync undoes). Group by Series and the #N cover badge read only series collections.
- **Smart shelf**: a saved library filter and search shown as a shelf with a live count. Three built-ins (Reading, Finished, Unrated) are not stored; the reader's own shelves sync.
- **Shelf view**: a collection's or smart shelf's own group-by and table columns, stored on it and synced, so opening it restores how it was arranged.
- **Selection**: a set of books picked for one bulk action. It survives filter and search changes, so it can be built across several views; *Select all N* adds every book in the current view, rendered or not.

### Wishlist

Titles saved from Explore without importing them (`wishlist`): a catalog book by its catalog id, or a web-novel series by its URL, each with the title, author and cover to show on a card. Saved with *Add to wishlist* on the catalog book page or the web-novel preview, and shown as a shelf on the Explore landing with a See all page. Not a book status: *Want to read* marks a book already in the [library](#library), while a wishlist title is not in it yet. Importing a title on this device, from its card or any other way, takes it off the wishlist; *Remove from wishlist* on its page or the remove button on its card takes any saved title off, also one that reached the library otherwise (by sync from another device). It syncs with sync on, with the [bookmark](#bookmark) rules for deletes: a removal is a sticky tombstone and an older client's push without a wishlist leaves it alone.

### Position

The reader's location in a book. The canonical app-side unit is **word position** — a zero-based index into the book's tokenized word stream. The lesefluss esp32 firmware still speaks byte offsets; conversion happens at that BLE seam, not in the middle. The rsvpnano speaks word index natively. See ADR-0002.

### Word position

A zero-based index into the book's tokenized word stream. The canonical position unit across the app: `books.wordPosition`, highlights, bookmarks, reading sessions, chapter starts, and all cross-device sync ship this unit. Convertible to a UTF-8 byte offset only via the book's `WordIndex`.

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

*Real sitting*: a session of at least one minute (`REAL_SITTING_MS`) with at least 5 words read. A shorter *burst* is not written; it waits in memory as a *carry*, and the next burst on the same book joins it if it starts within a sitting's longest pause (10 minutes) on the same day, in any mode: closing and reopening, switching modes and Quick RSVP windows add up to one sitting, saved once it reaches the minute. A sitting joined across modes is recorded as the mode it spent the most active time in; an RSVP-majority row keeps the RSVP dial. Carries are lost when the app restarts and dropped on sign-out, account change and a stats wipe.

*Words read* (`reading_sessions.wordsRead`) is the total length of the [read spans](#read-span), not the distance between start and end position.

*Furthest word* (`reading_sessions.furthestWord`) is the end of the highest read span: how far reading got in the sitting, where the end position is wherever a jump or moving back left it. Null on rows recorded before it existed. A sitting never spans local midnight: reading straight through midnight closes it and goes on in a new one from the same spot; a sitting paused, idle or suspended over midnight closes at its last activity and the next activity opens a new one. Each day keeps its own reading, at the cost of one more session for a sitting that crosses midnight. Discarding a sitting whose row was already written (undoing an auto-committed browse) deletes that row locally and on the server. A deleted session is tombstoned on the server and dropped by every other device on its next pull; the tombstone keeps nothing of the reading but the id, whether one session was deleted or all of them by Delete reading stats; a sitting still open on a device when its row is deleted goes on under a new id.

*Mode* is `rsvp`, `scroll`, `page` or `listen`. A `listen` sitting is [read aloud](#read-aloud) time, recorded from the voice's own playback log rather than by the reading tracker, so screen-off listening counts. It counts toward time, streaks, goals and totals, never toward a speed: average WPM, the WPM trend, records, time left and goal pace all skip it (`isMeasurableSitting` in `@lesefluss/core`). Its `wpmAvg` is null.

### Read aloud

Shown to users as **Listen**.

The phone's own speech engine reading the book out loud, from the current [position](#position) on (Android only, free and offline once a voice is downloaded). The original text is spoken, sentence by sentence, not the word index's folded tokens. While it is on, the voice owns the position: the reader saves the spoken word, follows it on screen, and a [listen session](#session) records the time. Scrolling or turning a page stops following without stopping the voice ("Back to voice" / "Listen from here"); tapping a word or jumping moves the voice there. After an interruption (a call, a navigation prompt, a Bluetooth disconnect) it resumes a few words back. In RSVP the voice paces the words. Leaving the reader stops it. Speed is set in words per minute, like everything else; the app learns each voice's pace to hit it. Voice, speed, pitch and rewind are device-local settings.

### Browse mode

A reader state for looking around without moving the [position](#position). It starts on any jump (TOC, search, highlight, glossary, progress-bar scrub), on a manual scroll too fast to be reading, or from the toolbar. The *anchor* is the position at entry; it is written once on entry if the DB doesn't already hold it. While browsing, nothing else is persisted (no DB, sync or device write) and the [session](#session) is paused. "Back to N%" returns to the anchor; "Read from here" makes the current spot the position and, if it moved, starts a new session. Moving on to the next chapter counts as "Read from here". A device position update moves the anchor, not the view. If the user settles into reading at the browsed spot (forward reading-pace movement for about two minutes), that counts as "Read from here", with a toast offering Undo; that reading counts toward the new session, and Undo discards it. Leaving the book while browsing resumes at the anchor. RSVP never browses: its saves always land, and switching to it reads from the browsed spot.

### Read span

A range of the book travelled forward at reading pace within one [session](#session). Movement above the mode's per-tick threshold is a jump (TOC navigation, a progress-bar scrub) and crosses its range without reading it; moving backwards reads nothing, though the range is credited if it is later travelled forward again.

Spans are merged, so a passage re-read in the same sitting counts once, while a gap skipped earlier and read later does count. They are a tracker-internal accounting device: never persisted, never synced. Only their total length is stored.

### Speed model

How fast this reader reads, from one function (`computeSpeedModel` in `@lesefluss/core`) that the app and the server both run on [session](#session) rows, so every surface shows the same number. Only measurable sittings count (`isMeasurableSitting`: no listening, no position jumps), and no *skimmed* ones: a scroll or page sitting above 600 wpm or 1.6x the reader's median sitting, or an RSVP sitting above 1.6x the RSVP median (`speedSittings`). A skimmed sitting's time and words still count toward totals, streaks and goals.

- **Reading speed**: words over active time in scroll and page together; the split per mode is kept for the reader.
- **RSVP speed**: words over active time in RSVP, which is what the engine delivered, shown next to the *dial* (the RSVP wpm setting, stored as `wpmAvg` on RSVP rows). Delivered runs under the dial because of punctuation pauses and the ramp.
- **Reading pace**: words over active time across both, so it follows the reader's mix of modes. It feeds every time estimate (book, goal, Explore) and is never shown as "your speed". Not the [reading goal](#reading-goal)'s **Pace** mode. In the reader, estimates use the current mode's speed instead.
- **Window**: which sittings count. *Recent* (the default) is the newest sittings up to 10 hours of reading; *30 days* and *all time* are the others.
- **Book speed**: a book's own words over active time, across all of its history. Its estimates use it once the book has 30 minutes of reading, the reading pace before that.
- **Fallback**: under 10 minutes of reading in the window, the speed comes from all measured sittings; under 10 minutes in those too, it is not measured yet: the latest speed test, else 225 wpm.

Estimates render as plain values ("4h 10m", no "~"); that a value is estimated is said only in a popover or details.

### Speed test

A one-minute measurement in two rounds, offered in onboarding and from the Speed tab: the reader reads a short passage normally (reading wpm, from words over the time between tap-to-begin and Done), then sees the passage's next part in RSVP at a suggested dial (RSVP wpm, from the delays the engine would use for the words shown, not the wall clock). A reading result outside 120 to 900 wpm is offered for a retry. Each result is a row in `speed_tests`, synced with the stats setting like [sessions](#session) and wiped with them, its values cleared on the server too; the latest one is the [speed model](#speed-model)'s fallback before 10 minutes of measured reading, and every one shows as a marker on the speed trend. Applying the result sets the RSVP dial; nothing else changes the dial.

### Bookmark

A named [word position](#word-position) in one book (`bookmarks`, label optional). It syncs with sync on, not behind the highlights or stats toggles. A delete is sticky: the server keeps the tombstone (until an admin purges tombstones, once every device has pulled) and no later push revives it, a server tombstone removes the local row whatever its stamp, and a local delete beats a live server row until it is pushed. Deleting a book or a serial takes its bookmarks along, on the server too for clients that send none. Delete reading stats keeps them.

### Reading goal

A reader's plan to finish one book, stored in `reading_goals` and synced last-write-wins on the raw client stamp: goals are plans, not stats, so they sync with stats sync off too, while [sessions](#session) stay on the device. At most one goal per book is *active*; the others are *completed* (the book crossed the finished threshold, or the reader said so; a goal cannot start on a book already past it) or *abandoned* (replaced by a new goal, or given up). Removing a goal tombstones it. Not available for serial chapters. Progress is measured by [position](#position), not by time read, so skipping ahead counts. All dates are local calendar days. The arithmetic lives in `services/stats/reading-goal.ts`.

Every goal is in one of two **modes**:

- **Deadline**: the target date is fixed. Each day's target is the remaining part of the book divided by the days left, so a missed day raises the days after it.
- **Pace**: the daily percent is fixed. A missed day moves the projected finish date instead.
  - **Minute goal**: a pace goal whose daily amount is minutes (`dailyMinutes`), the one exception to measuring progress by position: a day is met by the active reading time of that day's [sessions](#session) on the book, every mode and listening included (or by finishing the book that day). The projected finish is the words left over the minutes at the [book's reading pace](#speed-model). `dailyPercent` still holds what the minutes read at that pace, so older clients and the server see a valid pace goal; it drifts as the pace changes and is refreshed on a replan. With stats sync off, sessions stay on each device, so each device counts only its own minutes. A switch to deadline drops the minutes.

The mode can be switched at any time. A switch, or a new target date or daily percent, is a *replan*: the plan line restarts from today's start-of-day position, days already met carry over, and today's reading still counts for today. Deadline to pace keeps today's daily target as the pace; pace to deadline keeps the projected finish as the target date.

- **Start-of-day position**: the position at local midnight, taken from the last [session](#session) that ended before it (a session running across midnight gives its start position), else the goal's start. Reading on a [reader device](#reader-device) creates no sessions, only moves the position on BLE sync, so it counts toward the day it is first followed by an in-app session, or toward today while none has followed.
- **Daily target**: what today asks for, in percent of the book (shown to one decimal) and in minutes at the [book's reading pace](#speed-model). Fixed for the whole local day because it depends only on the start-of-day position. Reading past it is credited. Today's progress counts from the furthest point of the day: the furthest word today's [sessions](#session) read to (the open sitting's included in the reader) or the saved position, whichever is further. Once met the target stays met for the day even if the position moves back (a jump back, or e-ink snapping to a page start). A jump ahead and back does not count; a jump the reader stays at does, as does reading on a paired device today. Past days count the same way, with where the day ended as its position; that end comes from sessions, so a past day read only on a paired device, which records none, does not count. Ahead/behind still uses the current position.
- **Plan line**: the straight line from the plan's start to 100% on the target date (deadline) or at the daily percent per day (pace).
- **On track**: not behind the plan line. *Ahead/behind* is how far the position is past the line at the end of today, or short of it at the end of yesterday, in percent and in days of the line's slope. A reader who has not read yet today but met every earlier day is exactly on track.
- **Reminder**: an optional daily notification at a time stored on the goal (so it syncs), scheduled on the device as a local notification a few days ahead and rebuilt whenever the plan or the day changes. No reminder fires on a day whose target is met. Not available in the web build.
- **Days target met** / **days read**: two counters per goal, separate from the global streak. A day is read when it has a session for the book.

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
stats, shared highlights, [milestones](#milestone)). There is no public level. A section is shown only if both the visibility
and its toggle allow it; milestones also need the reading stats toggle.

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

### Share card

An image of a sitting, a finished book or the Speed tab's year (cover, title, terse stats, the
owner's @handle unless toggled off), in Story or Square format, handed to the device's share sheet
or downloaded on the web. Not a [Share](#share): nothing is offered to a friend.

### Milestone

A tier a reader has reached in words read, hours read, books finished, day streak or best RSVP
sitting wpm. Derived from sessions and finished books (`deriveMilestones` in core), never stored,
so the app and the server agree. Shown on the Speed tab, in the session summary and, unless
`show_milestones` or `show_stats` is off, on the profile, where friends see only the reached tiers by day.

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

The host may set a **deadline** (`buddy_read.target_date`), which every member sees. A member can adopt it as their own [reading goal](#reading-goal) (deadline mode) on their copy; adopting is a one-tap copy, never automatic, and a later change of the deadline leaves adopted goals as they are. The goal belongs to the member's book, so leaving the read keeps it. A deadline that has passed can no longer be adopted. The deadline shows in one place, the read's Deadline section, with the group pace beside it until the member adopts it; from then on their own goal says how they are doing.

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

### Activity feed

The Activity section of the Social tab: your own and your friends' [feed events](#feed-event),
newest first, for the last 90 days. A friend's event shows only while you are friends (no block,
no ban), their profile is visible to friends, their feed sharing is on and the section the event
belongs to is on; the book must still be in their library and not hidden from their profile. Items
show the day, never the time.

### Feed event

A row saying a reader **started** or **finished** a book (`social_feed_event`), recorded by the
server when a sync push moves a book from want to reading or to finished. Only one of each per
book. It stores no title or position: book details come from the reader's own library row when the
feed is read. A book the server has never seen and a finish older than 72 hours record nothing, so
restoring or importing a library never floods the feed. Started maps to the "currently reading"
profile section, finished to "finished books".

### Live board

The other members of a [buddy read](#buddy-read) shown on the reader's progress bar at their
position in the book, with whoever has the book open right now marked as **reading now** (or
**listening now** while [reading aloud](#read-aloud), without a speed) and their speed in the current sitting. Positions are the ones members already see; reading now and speed
live only in server memory, and speed is credited on the server with the same rule as reading
sessions, so skipping ahead does not count. A member's standing against their own reading goal on
the book shows in their marker's detail, computed on the server from their synced goal and position
in their own time zone. Only one number leaves the server: days ahead or behind, to one decimal.
Never the goal's mode, target date, daily amount or percent behind, since percent and days together
would give away the daily amount and so the date. No standing shows for a member who has finished
the book or has no known time zone. Goals sync whatever the stats setting, so stats sync off does
not hide a standing; "Delete reading stats" removes the goals. A member can switch off sharing
live activity, which also hides everyone else's, goal standings included.

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
- Not a changelog. Decisions go in `docs/adr/`.
- Not exhaustive. Add terms as they earn their place.
