# ADR-0003: Chunked book-content storage and sync exclusion of oversized books

Date: 2026-06-07
Status: Accepted

## Context

Importing a large EPUB hung, then crashed, on Android. Two distinct out-of-memory failures, both
from marshalling a whole string across the Capacitor bridge against a 256 MB ART heap (verified on a
Pixel 8 Pro):

1. **Picker.** `@capawesome/capacitor-file-picker` with `readData: true` base64-encoded the entire
   file into one native Java String. For a 50 MB file that needs a ~140 MB `char[]`. The native OOM
   was swallowed by Capacitor's activity-result path, so the `pickFiles()` promise never settled and
   the library import spinner spun forever.
2. **Persistence.** Even after reading bytes inside the WebView, a text-heavy book (a 50 MB EPUB of
   ~4.3 M words) crashed at `db.insert(book_content)`. Capacitor's `Bridge.callPluginMethod` runs
   `JSONObject.toString` over the plugin-call params, so the full `content` (and the larger
   serialized `wordIndex`, ~1.5-2x content per ADR-0002) crossed the bridge as one ~52 MB+ string →
   75 MB allocation → fatal OOM. The same allocation fires on READ, where the full row is returned.

Most 50 MB EPUBs are image/font-heavy with only a few MB of text; those are fixed by the picker
change alone. The persistence OOM only bites books with tens of MB of actual text (millions of
words), which this app can produce via its serial scrapers (AO3, ScribbleHub) and URL import.

## Decision

**Never cross the Capacitor bridge with one giant string.** Read and write the large `book_content`
columns (`content`, `wordIndex`) as [chunked columns](../../CONTEXT.md#chunked-column).

- `services/db/long-text.ts` is a deep module over an injectable executor: `appendLongText` seeds the
  row then appends `SET col = col || ?` per chunk; `readLongText` reassembles via `length` + `substr`.
  Chunk unit is code points (SQLite counts code points; the read advances by code-point count, not
  UTF-16 length); writes never split a surrogate pair. The interface is the test surface, exercised
  against sql.js.
- `commitBookContent` in `queries/books.ts` is the single writer that owns the chunked-write and
  partial-write cleanup invariant; `addBookWithContent` and `addServerBookWithContent` are thin
  callers. The common path (values within one chunk) stays a single plain insert, unchanged.
- The pick path reads bytes inside the WebView via `fetch(convertFileSrc(path))` instead of
  `readData: true`; the original file is written to disk in base64 chunks.

**Oversized books are [local-only](../../CONTEXT.md#local-only-book).** A single constant
`MAX_SYNCED_CONTENT_BYTES` (20 MB, the existing server Zod cap) and predicate `isSyncEligible(book)`
in `@lesefluss/core` define eligibility from `books.size`. Ineligible books are excluded from the
sync push entirely (their highlights/glossary drop out with them; reading sessions still outlive the
book, as for deletions). The book-detail page shows a warning when logged in. No new column.

**Oversized books do not persist a wordIndex.** For a book over the cap, `word_index` is stored NULL
and rebuilt from `content` on open via the existing `loadBookWordIndex` fallback. This avoids
chunk-storing a ~100 MB index (~200 round-trips) in exchange for a one-time rebuild on open.

## Reasons

- **The bridge is the constraint, not SQLite or V8.** SQLite holds the growing value natively (well
  under `SQLITE_MAX_LENGTH`); the reassembled string in V8 is fine. Only the per-call bridge payload
  was fatal, so bounding that is sufficient.
- **One writer, one invariant.** Chunked write + cleanup lived in two near-identical commit functions;
  consolidating concentrates the bug surface and the test target in one place.
- **Eligibility is derived, not stored.** `book.size` already exists; a predicate keeps the client
  filter, the server cap, and the UI warning from drifting. No migration.
- **Local-only over phantom.** Excluding the row entirely avoids a book that appears on a second
  device but cannot open (no content). The warning makes the trade-off legible.

## Relationship to ADR-0002

ADR-0002 persists the WordIndex so reader open is free. ADR-0003 keeps that for all normal books and
carves a single exception: books too large to sync skip persistence and rebuild on open. This is the
already-documented "invalidated (nulled) when content changes" state, not a new code path, and does
not reopen ADR-0002's canonical-unit decision.

## Consequences

- Opening a local-only (oversized) book rebuilds its WordIndex from content — a few seconds, once per
  open. Acceptable for a rare case; revisit if such books become common.
- A local-only book stays on the device that imported it. Its highlights and glossary entries are not
  synced (they have nowhere to anchor on other devices); its reading sessions still sync for all-time
  totals, consistent with deletions.
- Chunked I/O issues N sequential statements for a large book (~100 for a 50 MB content column),
  serialized through the write queue. Acceptable; the chunk size is tunable if the bridge round-trip,
  not the allocation, becomes the bottleneck.

## Not revisiting

Architecture passes should not re-propose:

- Writing or reading `book_content.content` / `wordIndex` in a single bridge call.
- Syncing books whose content exceeds `MAX_SYNCED_CONTENT_BYTES`.
- Always persisting the WordIndex regardless of book size (the oversized null+rebuild exception is
  deliberate).

Reopen only if: the Capacitor bridge gains a streaming/binary param path that removes the
whole-string marshalling cost, or the sync backend gains chunked content transfer that makes large
books syncable.
