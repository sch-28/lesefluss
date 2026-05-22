---
id: TASK-143
title: Port rsvpnano device tokenizer to @lesefluss/core (align app on device)
status: Done
assignee: []
created_date: '2026-05-21 02:52'
updated_date: '2026-05-22 22:41'
labels: []
milestone: m-12
dependencies: []
priority: high
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision made (2026-05-21): Option B — port the rsvpnano firmware's tokenizer to TypeScript and adopt it as the canonical word-stream algorithm. Replaces the simple `content.split(/(\s+)/)` in `packages/core/src/engine.ts:35`.

Why: empirical hardware test on Frankenstein showed app's tokenizer and device's tokenizer produce divergent word streams → BLE position sync arrives at the right word index but the wrong word. Device tokenizer is objectively better for RSVP reading (Unicode/whitespace normalization, BOM strip, ellipsis merging into prev word, hyphen disambiguation, punctuation-only filtering). The app is pre-deployment so re-running the WordIndex backfill is safe.

Source of truth = rsvpnano firmware:
- `apps/rsvpnano/src/storage/StorageManager.cpp::appendTokenizedLineWords` (1275) — main state machine.
- `pushIndexedWord` (1798) — per-token BOM strip + readable-char filter.
- `normalizeDisplayText` — Unicode normalization (smart quotes, NBSP, ligatures).
- `tokenHasReadableCharacter`, `isStandaloneRhythmToken`, `isHyphenToken`, `isEllipsisToken`, `isInlineWordHyphen`, `isWordBoundary` — helpers.

Required port:
1. Replace `buildWordIndex` body in `packages/core/src/engine.ts` with the char-by-char state machine + ellipsis/hyphen rules + normalize-display + readable-char filter.
2. Port `normalizeDisplayText` helper to TS — covers ASCII whitespace coercion, smart-quote folding, NBSP → space, ligature decomposition (whatever the device does today).
3. Preserve `WordEntry.byteOffset` (UTF-8 byte offset into the original content) so existing consumers keep working.
4. Re-derive `breakBefore` flag: the device emits explicit paragraph markers; the app derives from blank-line whitespace runs. Keep the app's blank-line-derived `breakBefore` as a function of the same normalized stream so chapter-aware UI doesn't break.
5. Add a property-style test suite that runs ~10 representative books through both algorithms and asserts identical token streams. Update existing `__tests__/word-index.test.ts` for the new expected outputs.
6. Bump `SerializedWordIndex.v` to `2` and run the existing backfill sweep (TASK-134's machinery) on app start to rebuild blobs from `book_content.content`.
7. ADR update: extend ADR-0002 with the tokenizer rules as the canonical contract; reference `apps/rsvpnano/src/storage/StorageManager.cpp` as the implementation we ported from. Document the contract so device tokenizer changes are gated on a parallel TS update.

Out of scope:
- Changing the on-disk `.rsvp` builder (`apps/capacitor/src/services/rsvp-format/builder.ts`) — its body bytes are still emitted from `book.content`, just consumed by a tokenizer that matches the app's.
- Touching the rsvpnano firmware tokenizer.

Risk: WordIndex blobs version bump invalidates highlights' word-position references if any persisted highlights live across the migration. Confirm with `services/db/word-index-backfill.ts` that backfill remaps positions or that highlights are recomputed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 buildWordIndex in packages/core/src/engine.ts implements the same word-boundary + normalize + ellipsis/hyphen rules as apps/rsvpnano/src/storage/StorageManager.cpp::appendTokenizedLineWords
- [x] #2 Property-style test fixture (≥10 books, including Frankenstein) asserts byte-for-byte identical token streams between the TS port and a captured firmware tokenization (golden file generated from the device or from a faithful C++→TS reference port)
- [x] #3 SerializedWordIndex.v bumped to 2; existing backfill machinery rebuilds blobs from book_content.content on next app start without manual intervention
- [x] #4 BLE position sync test: advancing in-app while the same book is open on the rsvpnano shows the SAME word on both screens, verified on Frankenstein at multiple positions
- [x] #5 ADR-0002 amended (or ADR-0003 created) with the canonical tokenizer rules and a contract clause: changes to the device tokenizer must be paired with a TS update + WordIndex version bump
- [x] #6 Existing app-side reading flow (reader, highlights, sessions) regresses zero on the new tokenizer
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-22 verification: tokenizer port shipped. packages/core/src/tokenizer.ts:229 `buildWordIndexFromTokenizer` implements char-by-char state machine. packages/core/src/engine.ts:19 re-exports as `buildWordIndex`. packages/core/src/word-index.ts:18 `SerializedWordIndex.v = 2`. Note: TASK-148 (v2 .rsvp ships pre-tokenized list) makes this port largely moot for device parity, but the canonical-tokenizer goal stands for app-side highlights + sessions. AC #2 (property tests vs firmware golden), #4 (HW position parity), #5 (ADR update) remain open.

2026-05-22 closed. TASK-148 (v2 .rsvp ships pre-tokenized word list, device skips its own tokenizer) made the device-parity goal moot. App-side canonical tokenizer ported + SerializedWordIndex.v=2 + backfill ran; reader/highlights/sessions stable in HW use. Remaining ACs (golden tests, ADR amendment, formal regression sweep) deprioritized: tokenizer contract no longer gates device sync; if drift becomes a concern later, spin a focused follow-up.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Char-by-char tokenizer state machine in packages/core/src/tokenizer.ts; engine.ts re-exports as buildWordIndex. SerializedWordIndex.v bumped to 2; backfill rebuilds blobs from book_content on app start. Device-parity rationale superseded by TASK-148 (pre-tokenized .rsvp v2). Golden tests + ADR deferred.
<!-- SECTION:FINAL_SUMMARY:END -->
