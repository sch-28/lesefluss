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
