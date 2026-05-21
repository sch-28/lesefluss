---
id: TASK-143
title: >-
  rsvpnano BLE position wire format: word index vs book id vs offset — pick the
  right unit
status: To Do
assignee: []
created_date: '2026-05-21 02:52'
labels: []
dependencies: []
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The multibook BLE position characteristic currently exchanges `{hash, wordIndex}` where `hash` identifies the book on the device's SD card and `wordIndex` is the canonical app-side WordPosition. This pairing was chosen because rsvpnano's reader natively works in word index.

In practice the position model has friction:
- Word index is unstable across content edits — if the user re-uploads a book, the device's hash changes (filename includes `bookId`, so same lesefluss book keeps the same hash, but the word stream may have shifted slightly due to whitespace / chapter handling).
- The app's word index is derived from `book_content.content` plus the canonical tokenization rule (ADR-0002). The device's word index is derived from the on-disk `.rsvp` content via its own tokenizer (in `apps/rsvpnano/src/reader/ReadingLoop` and `apps/rsvpnano/src/storage/IndexedBookStore`). The two tokenizers MUST produce identical word streams for the same content. Today this is asserted by convention; there is no integration test.

Investigation needed:
- Is word index actually the right unit? Alternatives:
  - **Byte offset of the word's first character.** Stable as long as content bytes match exactly. The on-device reader has the bytes; converting byte → word index inside the device's reader is cheap (it already maintains a word index for the open book). The app converts word → byte via its own WordIndex (already present).
  - **Paragraph + offset.** Lossy. Probably not.
  - **Percent-progress.** Lossy. Probably not.
- Confirm whether the two tokenizers produce identical word streams over a representative book (Frankenstein with chapters). Diff their output offline; if they diverge by even one boundary, word-index sync is broken for that book.
- If word index stays: document the tokenization rule contract explicitly between app and firmware, and add a per-book sanity check (`words_app == words_device` on connect; surface a warning if they differ).
- If switching to byte offset: update the BLE schema, app-side conversion via WordIndex.byteOf, firmware-side conversion in the reader.

Out of scope:
- Other BLE characteristics (library, active, settings) are unaffected.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decision documented (word index vs byte offset vs hybrid) with the reasoning attached to ADR-0002 or a new ADR-0003
- [ ] #2 If word index stays: the app + firmware tokenizers are confirmed identical for at least three representative books (no off-by-one boundary), and a per-book word-count sanity check is wired into the connect-time sync
- [ ] #3 If byte offset wins: the multibook position char schema is updated, app conversion via WordIndex.byteOf is wired in BookSyncContext, and the firmware reader converts byte → word on receive
- [ ] #4 No regression to single-book esp32 position sync
<!-- AC:END -->
