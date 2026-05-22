# RSVP file format + BLE transfer protocol

Status: **draft (WIP)**: written 2026-05-21 to anchor TASK-148 work after a round of whack-a-mole debugging. Goal: every wire decision in one place, with test vectors, so the app builder and rsvpnano firmware parser cannot drift again.

This document is the authoritative spec. Both sides MUST match it or the integration tests fail.

---

## Scope

- `.rsvp` file format, versions 1 and 2.
- BLE multibook transfer protocol (start frame → body → end ACK).
- Active-hash + position characteristic semantics, only as far as they interact with a freshly uploaded book.
- Out of scope: WiFi-AP HTTP sync, single-book ESP32 transfer, library characteristic (separate spec, TASK-150).

---

## Glossary

- **App**: capacitor reader (TypeScript, builder lives in `apps/capacitor/src/services/rsvp-format/builder.ts`).
- **Device**: rsvpnano firmware (C++, parser lives in `apps/rsvpnano/src/storage/StorageManager.cpp`).
- **Canonical WordIndex**: `@lesefluss/core` tokenizer + position lookup. App builds fresh per upload.
- **Word stream**: ordered list of words emitted by the canonical tokenizer.
- **Word index**. 0-based position of a word in the stream.

---

## .rsvp file format

### Common encoding rules

- UTF-8 throughout. No BOM.
- Lines separated by single `\n` (0x0A). No `\r`.
- Device reader strips `\r` on read; builder MUST NOT emit `\r`.
- Trailing `\n` at end of file is mandatory.
- Lines have no length cap from the spec, but the device buffer flushes at 4096 chars; words longer than that produce undefined behavior. Builder MUST guarantee no individual line exceeds 4096 bytes.

### v1 (legacy, sideload-compatible with upstream rsvpnano)

Used when uploading from sources without an app-built WordIndex. Also accepted when sideloaded by the user from upstream tools.

```
@rsvp 1
@title <title>
@author <author>           (optional)
@source <source>           (optional)

@chapter <title 1>
<chapter body lines, leading literal `@` escaped to `@@`>

@chapter <title 2>
<…>
```

Device tokenizes body lines on parse. Word stream is whatever the firmware tokenizer (`appendTokenizedLineWords` in StorageManager.cpp) produces. NOT canonical with the app.

### v2 (lesefluss canonical, this spec's focus)

Used for all lesefluss-originated uploads. Device skips its own tokenizer; the app ships the canonical word stream directly.

#### Structure

```
@rsvp 2
@title <title>
@author <author>           (optional)
@source <source>           (optional)

@words <N>
<word_0>
<word_1>
…
<word_{N-1}>

@paragraphs <M>
<paragraph_word_index_0>
<paragraph_word_index_1>
…
<paragraph_word_index_{M-1}>

@chapters <K>
<chapter_word_index_0>\t<chapter_title_0>
<chapter_word_index_1>\t<chapter_title_1>
…
<chapter_word_index_{K-1}>\t<chapter_title_{K-1}>
```

Rules:

1. **Header lines come first**, in order: `@rsvp 2`, `@title …`, optional `@author …`, optional `@source …`, then one blank line.
2. **`@words N` introduces a count-bounded block.** Exactly N lines follow, each a raw word from the canonical tokenizer. NO escaping. Words MUST NOT contain `\n`, `\r`, or `\t`. Words MAY start with `@` (e.g. `@home`). Words MAY be empty (an empty line). The N count is the SINGLE source of truth. the device's parser is count-bounded and trusts it.
3. **`@paragraphs M` introduces a count-bounded block.** Exactly M lines follow, each an unsigned integer in base 10 (`String::toInt()`-compatible). Each is a word index where a paragraph starts. Indices are in ascending order; duplicates are ignored by the device.
4. **`@chapters K` introduces a count-bounded block.** Exactly K lines follow, each formatted as `<wordIndex>\t<title>`. Title MUST NOT contain `\t` or `\n` (builder collapses to single space).
5. No directives appear inside a block. `@anything` lines are treated as raw block content (e.g. a word starting with `@`).
6. Blocks appear in order: `@words` → `@paragraphs` → `@chapters`. K=0 or M=0 blocks are emitted with the directive but zero data lines.

#### Why count-bounded blocks

ATT/BLE transports lose bytes silently if upper-layer protocols are sloppy. Count-bounded blocks let the parser detect truncation immediately (`@words N` declared, fewer than N lines arrived → `read loop done v2Remaining > 0`). Without counts, a partial transfer that ends mid-stream looks like a valid end of file.

---

## App builder invariants

Implemented in `apps/capacitor/src/services/rsvp-format/builder.ts::buildV2`.

INV-B1: `entries.length` MUST equal the count emitted in `@words <N>` AND the number of word lines written between `@words` and `@paragraphs`.

INV-B2: Each `e.word` MUST satisfy `/^[^\n\r\t]*$/`. The tokenizer never emits whitespace-containing words; the builder also guards against `materializeEntry`-derived word strings that picked up internal `\n` from ellipsis-merge across newlines. The accepted defense is to always call `WordIndex.build(content)` fresh (bypasses materializeEntry).

INV-B3: `paragraphWordIndices.length` MUST equal the count emitted in `@paragraphs <M>` AND the number of integer lines written between `@paragraphs` and `@chapters`.

INV-B4: `chapterEntries.length` MUST equal the count emitted in `@chapters <K>` AND the number of chapter lines written after `@chapters`.

INV-B5: Each chapter title is whitespace-collapsed (no `\t`, no `\n`).

INV-B6: Final byte is `\n`.

INV-B7: Total byte length is deterministic given the same (content, chapters, title, author, source) inputs.

These are verified by `services/rsvp-format/__tests__/builder.test.ts` (existing + to-be-added integration cases).

---

## Device parser invariants

Implemented in `apps/rsvpnano/src/storage/StorageManager.cpp::processIndexedRsvpV2Line` (state machine) + `emitV2WordRecord`.

INV-P1: `v2Mode` is set to `true` after observing `@rsvp 2` and never reset until end of parse.

INV-P2: `v2State` transitions only forward: HEADER → WORDS → PARAGRAPHS → CHAPTERS → DONE. Never back.

INV-P3: V2_WORDS state emits exactly one WordRecord per call. After the Nth call (where N = `@words` declared count), state transitions to V2_PARAGRAPHS unconditionally.

INV-P4: V2_WORDS does NOT inspect line content for directive prefixes; every line is treated as a word. (Earlier "abort on `@` line" check was wrong and dropped legitimate words like `@home`.)

INV-P5: V2_PARAGRAPHS and V2_CHAPTERS, while still awaiting their introductory directive (`v2Remaining == 0`), silently drop any non-directive line. This is the failure mode for truncated transfers. strays appear in the log.

INV-P6: Parser does not depend on the file's actual byte length matching the `@words/@paragraphs/@chapters` declared counts. If the source ends early, `v2Remaining > 0` at loop exit. The trailing log surfaces this.

---

## BLE transfer protocol (multibook)

Defined by `services/devices/multi-book/transfer-impl.ts` + `BleSyncManager::onTransferWrite`.

### Frames

- **Start frame:** JSON header written with response (`BleClient.write`). Body: `{filename, category, sizeBytes}`. Triggers `beginUpload`.
- **Body chunks:** `writeWithoutResponse`, max `chunk_size` bytes each. Sequential. App yields the JS event loop every 16 chunks to avoid Android queue overflow.
- **End frame:** ACK from device once `bytesReceived >= sizeBytes` AND `finishUpload` succeeds.

### Notify frames from device

- `ACK:START`: header parsed, `beginUpload` ok.
- `ACK:END`: all bytes received, file renamed to final.
- `NACK:START:<reason>`: header invalid.
- `NACK:WRITE:io`: SD write failed mid-upload.
- `NACK:END:rename`: final rename failed.

### App timeout

- `ACK:START`: static `ACK_TIMEOUT_MS` (5s).
- `ACK:END`: scales with size: `5000 + sizeBytes/1024 × 30 ms`, capped 5 min.

### Firmware buffer + concurrency

- `BleSyncManager::onTransferWrite` runs on NimBLE host task.
- `BleSyncManager::update()` runs on Arduino loop task.
- `upload_.pendingBytes`, `bytesReceived`, `pendingFinish_` are accessed from both tasks.
- INV-T1: Access MUST be inside `portENTER_CRITICAL(&uploadMux_) … portEXIT_CRITICAL(&uploadMux_)`. Concurrent unguarded access drops bytes silently.
- INV-T2: SD writes happen OUTSIDE the critical section, on a swapped-out vector.

### File integrity check

INV-T3: After `ACK:END`, the file on SD MUST be exactly `sizeBytes` long. The device parser logs `read loop done totalBytes=… sourceBytes=…`. these must equal `sizeBytes` and each other.

If `sourceBytes < sizeBytes` post-ACK, the BLE drain dropped bytes. This is the symptom that motivated the mutex fix.

---

## Active-hash semantics (only as it ties to v2 upload)

App writes `active` characteristic with `{hash}` after the upload's ACK:END. Firmware:

1. `applyActiveHash` (NimBLE host task) writes NVS and queues `pendingActive_`.
2. `BleSyncManager::update()` (Arduino loop) drains and fires `activeListener_`.
3. `App::onBleActiveBookChange` resolves path, refreshes storage inventory (so freshly uploaded file appears), calls `loadBookAtIndex`.
4. `loadBookAtIndex` triggers v2 parse if no fresh `.idx` exists.

INV-A1: `pendingActive_` and `pendingActiveHash_` are read/written across tasks. They share the same race surface as `pendingBytes`. TBD whether to extend `uploadMux_` to cover them or use a separate mutex. (Open: see "Audit list" below.)

INV-A2: `App::onBleActiveBookChange` MUST be idempotent. multiple active writes for the same hash should re-open the book without corruption.

---

## Audit list: fields that may need mutex coverage

These fields are written from `BleCharacteristicCallbacks::onWrite` (NimBLE host) and read from `update()` (Arduino loop). Currently only `pendingBytes` + `bytesReceived` + `pendingFinish_` are guarded.

| Field | Writer (host) | Reader (loop) | Currently guarded? | Risk |
|---|---|---|---|---|
| `pendingBytes`, `bytesReceived`, `pendingFinish_` | onTransferWrite | update() drain | ✔ (just added) | Was dropping bytes |
| `pendingHeader` + filename + category + bytesExpected | onTransferWrite (header path) | update() drain | ✗ | Header could race with body; rare |
| `pendingPosition_` + hash + word | applyPositionJson | update() drain | ✗ | Position writes interleaved with active writes; rare |
| `pendingActive_` + hash | applyActiveHash | update() drain | ✗ | Active-hash race; rare |
| `pendingDelete_` + hash | onDeleteWrite | update() drain | ✗ | Delete race; rare |

Action item: extend `uploadMux_` (or rename to `bleEventMux_`) to cover ALL pending* fields. The cost is negligible (microseconds per critical section) and removes a class of race bugs.

---

## Test vectors

### Vector 1: empty book

Input:
```ts
buildRsvpDocument({ title: "Empty", body: "", wordIndex: WordIndex.build(""), version: 2 })
```

Expected bytes (`\n` shown as literal):

```
@rsvp 2
@title Empty

@words 0
@paragraphs 1
0
@chapters 0
```

(plus trailing `\n`)

Device parse result: wordCount=0, paragraphCount=1, chapterCount=0. Book opens to "no readable words"; status falls back to filename.

### Vector 2: single-paragraph plain ASCII

Input:
```ts
const content = "alpha beta gamma";
buildRsvpDocument({ title: "T", body: content, wordIndex: WordIndex.build(content), version: 2 })
```

Expected:
```
@rsvp 2
@title T

@words 3
alpha
beta
gamma
@paragraphs 1
0
@chapters 0
```

### Vector 3: ellipsis across newline (the materializeEntry bug)

Input:
```ts
const content = "foo\n\n...\n\nbar";
```

Canonical tokenizer: ellipsis merges into the previous word. Stream = `["foo...", "bar"]`. Word count = 2.

Expected (note: NO `\n` inside `foo...`):
```
@rsvp 2
@title T

@words 2
foo.. bar
@paragraphs 3
0
1
1
@chapters 0
```

The earlier bug was that `materializeEntry` derived `foo\n...` from a content slice + trailing-trim. The integration test for this vector must assert byte-for-byte equality with the expected output.

### Vector 4: words starting with `@`

Input:
```ts
const content = "ping @user reply @bot";
```

Stream = `["ping", "@user", "reply", "@bot"]`.

Expected:
```
@rsvp 2
@title T

@words 4
ping
@user
reply
@bot
@paragraphs 1
0
@chapters 0
```

The earlier bug was V2_WORDS aborted on `@user` thinking it was a stray directive. Parser must consume `@user` and `@bot` as words.

### Vector 5: round-trip on full Frankenstein

(Generated, not hand-written.)

- Fetch Frankenstein from Standard Ebooks (committed as a test fixture under `services/rsvp-format/__tests__/fixtures/`).
- App builder produces bytes.
- A reference parser (TS port of the firmware state machine, mirroring `processIndexedRsvpV2Line`) consumes the bytes and reconstructs the word stream.
- Assert: `wordCount === expected` AND `paragraphCount === expected` AND `chapterCount === expected`.
- Assert: every word in the reference parser's output is identical to the corresponding `WordIndex.listEntries()[i].word`.

This is the test that catches drift between builder and parser.

---

## Open items

- [ ] Write the reference TS parser (`services/rsvp-format/parser.ts`) mirroring `processIndexedRsvpV2Line`. Used by tests; not shipped at runtime.
- [ ] Add Frankenstein fixture.
- [ ] Add round-trip integration test.
- [ ] Extend firmware mutex to cover all `pending*` fields.
- [ ] Decide: keep v1 builder path or drop it. Sideload of upstream-format `.rsvp` files is the only use case; if we drop, sideloaders get the firmware tokenizer.
- [ ] Resolve TASK-150 (library char chunked NOTIFY). orthogonal to v2 but blocks app-side sync verification.

---

## Change log

- 2026-05-21: initial draft. Captures every known-good and known-broken invariant after a long debugging session. Pre-test vectors, pre-reference-parser; those will land next.
