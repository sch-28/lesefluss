---
id: TASK-41
title: Split long words on ESP32 and capacitor reader
status: Done
assignee: []
created_date: '2026-04-26 15:59'
updated_date: '2026-04-26 15:53'
labels: []
milestone: m-5
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Long words exceed the RSVP focal display and are hard to read in a single frame. Split words longer than a threshold (default 13) into multiple consecutive RSVP frames on both the ESP32 firmware and the capacitor reader, while keeping all position/byte-offset semantics unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Words >13 chars are displayed as multiple chunks (hyphen-aware split, hard-cut fallback with trailing '-')
- [x] #2 Position save / resume still anchors to the start of the original word (byte offsets unchanged)
- [x] #3 Dictionary lookup, context peek, sentence/word navigation, scrub, progress bar work as before
- [x] #4 Punctuation delay multipliers fire only on the chunk that contains the punctuation (naturally the last chunk for trailing punct)
- [x] #5 ESP32 scrub mode shows full words (no chunking)
- [x] #6 Shared splitLongWord helper in rsvp-core with matching Python implementation in esp32
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan

### 1. Shared splitter (rsvp-core)
- Add `splitLongWord(word, maxLen = 13): string[]` to `packages/rsvp-core/src/engine.ts`.
- Algorithm: split on hyphens first (keep hyphen at end of each part), greedily merge parts up to `maxLen`. Any chunk still > `maxLen` gets hard-cut at `maxLen-1` with a trailing '-' appended (last piece keeps original tail).
- Export `MAX_WORD_LEN = 13`.

### 2. Capacitor reader (`apps/capacitor/src/pages/reader/use-rsvp-engine.ts`)
- Add `chunkQueueRef: useRef<string[]>([])` to engine state.
- Modify `tick()`:
  - When queue empty: pull `entry = w[idx]`, populate queue from `splitLongWord(entry.word)`, do position-save throttle once (anchored to `entry.byteOffset`).
  - Each tick: pop next chunk, `setCurrentWord({ ...entry, word: chunk })`, compute delay from chunk text (trailing punct lands on last chunk naturally), advance acceleration.
  - When queue drains: `wordIndexRef.current = idx + 1`.
- `jumpToWord`, `play`, `pause` reset `chunkQueueRef.current = []`.
- Untouched: `wordsRef`, `displayedOffsetRef` (still set to `entry.byteOffset`), `lookupFocalWord` (reads original from `wordsRef`), context peek, sentence nav, scrub, progress bar.

### 3. ESP32 firmware (`apps/esp32/src/reader/rsvp.py`)
- Add module-level `MAX_WORD_LEN = 13` and a private `_split_long_word(word)` mirroring the JS algorithm.
- Add `self._chunk_queue = []` in `__init__` and reset in `load_text`.
- Modify `display_next_word()`:
  - When queue empty: set `_display_pos` from `word_reader.get_position()`, pull next full word via `_next_word()`, populate queue.
  - Each call: pop next chunk, draw via `display.show_word(chunk)`.
- Do **not** chunk in `step_word` (scrub mode keeps full words).
- Untouched: `WordReader`, `ScrubWindow`, `save_position`, `get_word_delay`, acceleration, BLE.

### 4. Verify
- `pnpm check-types` in `apps/capacitor`.
- `pnpm --filter @lesefluss/rsvp-core build` (or whatever the core build is).
- Manual sanity: long words like "Antidisestablishmentarianism" and "blue-dragonfly-shine" split as expected.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Long-word splitting for RSVP

Long words now display as multiple consecutive RSVP frames so 14+ char words are readable. Implementation is contained: position model, navigation, scrub, progress bar, dictionary, and context peek are all unchanged.

### Changes

**`packages/rsvp-core/src/engine.ts`**
- New exports: `MAX_WORD_LEN = 13`, `splitLongWord(word, maxLen?)`.
- Hyphen-aware: greedily merges hyphen-delimited parts up to `maxLen`. Falls back to hard-cut with trailing `-` on non-final pieces. Words at/below the limit return `[word]`.

**`apps/capacitor/src/pages/reader/use-rsvp-engine.ts`**
- Added `chunkQueueRef`. `tick()` populates the queue when empty and pops one chunk per tick.
- `displayedOffsetRef` and the throttled position save fire only when starting a new word (anchored to original `entry.byteOffset`), so all position semantics (resume, sync, BLE position write) are preserved.
- `setCurrentWord` renders a synthetic `{ ...entry, word: chunk }` while keeping the original byteOffset; `wordsRef` is untouched, so `lookupFocalWord`, context peek, and sentence nav all read the original word.
- `wordIndexRef` advances only on the last chunk.
- `play`, `pause`, `jumpToWord`, and the external-scrub effect reset the queue. `pause` also restores the original word so the focal/context view doesn't sit on a mid-word chunk.
- Punctuation multipliers fire naturally on the last chunk (where trailing punctuation lives).

**`apps/esp32/src/reader/rsvp.py`**
- Added `MAX_WORD_LEN` and `_split_long_word()` mirroring the JS algorithm.
- Added `self._chunk_queue` (init + reset in `load_text`).
- `display_next_word()` sets `_display_pos` once at the start of each word, populates the queue from `_next_word()`, and emits one chunk per call.
- `enter_scrub()` clears the queue so scrub navigates by full word.
- `WordReader`, `ScrubWindow`, `save_position`, `get_word_delay`, acceleration, and BLE are untouched.

### Verified
- `pnpm check-types` in `apps/capacitor` passes.
- Sanity check on the Python splitter:
  - `hi` → `['hi']`
  - `blue-dragonfly-shine` → `['blue-', 'dragonfly-', 'shine']`
  - `Antidisestablishmentarianism` → `['Antidisestab-', 'lishmentaria-', 'nism']`
  - `a-very-very-very-long-hyphenated-thing` → `['a-very-very-', 'very-long-', 'hyphenated-', 'thing']`
<!-- SECTION:FINAL_SUMMARY:END -->
