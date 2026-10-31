# ADR-0002: Word index is the canonical position unit

Date: 2026-05-20
Status: Accepted

## Context

Lesefluss is an RSVP reader: it renders one word at a time. The original lesefluss esp32 firmware stores its position as a UTF-8 byte offset into a plain-text file, because byte offsets are cheap to seek on the device's flash. The capacitor app inherited this unit as its canonical position type. Every domain object — `books.position`, `highlights.{startOffset, endOffset}`, `readingSessions.{startPos, endPos}`, `book_content.chapters[].startByte` — stores bytes.

When the rsvpnano device was added (ADR-0001), its multi-book BLE schema declared `MultiBookPosition = { hash, wordIndex }` because the rsvpnano firmware works in word units. That decision exposed friction the byte-offset choice had been hiding:

- Five separate sites in the reader reinvent UTF-8 byte arithmetic (`utf8ByteLength`, `charIndexToByteOffset`, `getWordOffsets`, `wordsInBytes`, `findSpanAtByteOffset`, `findAlignmentSpan`). The same tokenization rule is encoded inline at each site with subtle drift.
- The search modal computes JavaScript character offsets but calls back into the reader with what the reader treats as byte offsets — a live bug.
- The session tracker rescans content bytes to count words on every tick.
- `position: number` is untyped: nothing in the type system prevents a byte from being passed where a word is expected, or vice versa.
- Multi-book position sync is blocked until the app can speak word index.

Two units flowing through one numeric type is the underlying shape of all of these.

## Decision

Word position is the canonical position unit across the capacitor app. The single-book esp32 BLE seam is the only place in the system that translates word ↔ byte. The lesefluss esp32 firmware keeps its byte-offset storage unchanged. The rsvpnano firmware keeps its word-index storage unchanged. Conversion lives entirely in the app, at one well-named place per device class.

Five surfaces move to word position together, in one refactor:

1. **WordIndex deep module.** `WordIndex.fromBook(book) → { wordCount, wordAt, byteOf, wordOf, wordsBetween, ... }`. Per-book, lazily built from `book_content.content`, persisted in a new `book_content.wordIndex` column. Single consumer of the [tokenization rule](../../CONTEXT.md#tokenization-rule). Replaces every inline byte-arithmetic site.
2. **Typed Position seam.** `WordPosition = Brand<number, "word">` defined in `@lesefluss/core`. Every position-bearing column, sync payload, and BLE descriptor consumes the brand. The compiler enforces unit safety.
3. **Highlight anchor as `{ startWord, startCharInWord, endWord, endCharInWord }`** — Option A word-snap with sub-word precision preserved.
4. **Reading-session backfill.** `readingSessions.{startPos, endPos}` move to word position; legacy byte deltas convert in the same backfill pass.
5. **Chapter starts** become `startWord`.

## Reasons

- **One unit beats two.** Today the app has two units flowing through one untyped `number`. That is a permanent source of bugs (search-modal char/byte already live). Locking the canonical unit lets the type system enforce the rule.
- **Word position is what the domain actually means.** An RSVP reader's job is to advance through words. Highlights, sessions, progress, sync — every domain question is in word space. Bytes are an implementation detail of one device.
- **Conversion only at the firmware seam.** The lesefluss esp32 stays single-book and byte-indexed (ADR-0001). Translating at the BLE codec adjacency in `BookSyncContext` keeps domain logic out of the protocol seam and protocol details out of the domain.
- **Multi-book sync unblocked.** TASK-131's deferred position sync (D5/D6) becomes trivial once `WordPosition` is canonical — the multi-book descriptor already speaks it.
- **WordIndex earns its keep.** Deletion test: removing the module reintroduces UTF-8 arithmetic at five+ sites. The complexity it absorbs is real.
- **Persisted WordIndex.** Storing the index in `book_content.wordIndex` is ~1.5–2× content size; in exchange every reader open, sync push, and highlight render is instant, and the backfill pass is the same code as steady-state operation.

## Migration

Two-release sequence. Code is single-variant from day one of Release N — there is no dual-shape code path. Schema carries dead columns for one release as a rollback safety net.

### Release N (additive)

- **Drizzle migration `0025`**: add columns alongside existing byte columns. No drops.
  - `books`: `word_position INTEGER NULL`, `position_unit TEXT NOT NULL DEFAULT 'byte'`.
  - `book_content`: `word_index BLOB NULL` (JSON-encoded `WordEntry[]`).
  - `highlights`: `start_word INTEGER NULL`, `start_char_in_word INTEGER NULL`, `end_word INTEGER NULL`, `end_char_in_word INTEGER NULL`.
  - `reading_sessions`: `start_word INTEGER NULL`, `end_word INTEGER NULL`.
  - `book_content.chapters` JSON gains `startWord` alongside `startByte`.
- **Web migration**: mirror the same additive columns on `sync_books`, `sync_highlights`, `sync_reading_sessions`.
- **App-start sweep**: on first launch of Release N, iterate every book with `chapter_status = "fetched"` and `position_unit = "byte"`. Per book, in one transaction: build `WordIndex` from `book_content.content`, persist it to `book_content.word_index`, convert `books.position` → `books.word_position`, convert each highlight's byte anchors → word anchors, convert each session's byte deltas → word deltas, convert chapter `startByte` → `startWord`, set `position_unit = "word"`. Idempotent — books with `position_unit = "word"` are skipped. Crash mid-pass resumes cleanly on next start. UI shows a blocking progress indicator during the sweep.
- **Pending / locked / error books** are skipped during the sweep. They have no `book_content` row. On chapter-fetch commit (`services/book-import/commit.ts`), the same conversion runs inline for the just-fetched book.
- **Code reads/writes word columns only.** Reader, highlights, sessions, sync, single-book BLE all consume `WordPosition`. Byte columns are present in the schema but no production code path reads them. The library "started?" badge (`book.position > 0`) becomes `book.wordPosition > 0` and remains a unit-agnostic nonzero check.
- **Single-book BLE conversion** lives in `BookSyncContext`, adjacent to the codec, not inside it. Codec stays a pure JSON↔DataView seam. `BookSyncContext` reads the active book's `WordIndex` and calls `byteOf` / `wordOf` at the moment it pushes to or receives from the codec.
- **Cloud sync writes both shapes.** Upload payloads from a Release N client carry word fields (canonical) *and* byte fields (recomputed via `WordIndex.byteOf`). Old clients see populated byte fields and remain functional. New clients ignore byte fields on download.
- **Cloud sync accepts both shapes.** The `/api/sync` endpoint accepts uploads from old clients (byte only) and new clients (both). No min-version gate.

### Release N+1 (cleanup)

- Drizzle migration `0026` drops byte columns: `books.position`, `highlights.{start_offset, end_offset}`, `reading_sessions.{start_pos, end_pos}`, `book_content.chapters[].startByte`. Drops `books.position_unit` (no longer needed — every book is word).
- Web migration mirrors.
- Sync payload schema drops byte fields. Min-version gate enforced at this point.

## Consequences

- **The tokenization rule becomes load-bearing.** Two `WordIndex` instances built from the same content must produce identical word positions. The rule lives in `@lesefluss/core` and is documented in CONTEXT.md. Any future divergence with the rsvpnano firmware tokenizer breaks multi-book position sync — flagged as a known risk to resolve when TASK-131 D5/D6 (position sync) lands.
- **Sub-word selection is preserved.** Option A's `startCharInWord` / `endCharInWord` carry the character precision the current byte-offset anchors had. The backfill converts existing byte anchors by computing the word containing the byte and the character index within that word; no data loss.
- **`WordIndex` storage costs roughly 1.5–2× content size on the app side.** Accepted because reader, sync, and highlight render become free. The web database does not store `WordIndex` — the server has no content and never tokenizes.
- **Backfill correctness depends on `book_content.content` being byte-accurate.** Books imported via `@lesefluss/book-import` produce plain UTF-8 with no `@` directives; this property is what makes the tokenization rule applicable directly. The `@` escape is a feature of the on-disk `.rsvp` file format only, never of in-DB content.
- **The deferred multi-book position sync (TASK-131 D5/D6) becomes a thin layer** once `WordPosition` is canonical — the multi-book descriptor's existing `wordIndex` field flows end-to-end with no conversion.
- **Search-modal char/byte mismatch is fixed by construction.** Search becomes `WordIndex.findText → WordPosition[]`; the reader's jump API takes `WordPosition`. The bug becomes unrepresentable.

## Not revisiting

Architecture passes (`/improve-codebase-architecture`) should not re-propose:

- Switching the app's canonical unit back to bytes.
- Moving byte ↔ word conversion into the BLE codec layer (codec stays content-agnostic).
- Persisting `WordIndex` server-side.
- Storing both units long-term as parallel columns (the transition is one release only).

Reopen only if: a new device class shows up that cannot speak word units and cannot be converted at its seam, or the chosen tokenization rule turns out to be lossy for content shapes the importer produces.
