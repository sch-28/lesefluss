---
id: TASK-132
title: WordIndex module + WordPosition brand in @lesefluss/core
status: Done
assignee: []
created_date: '2026-05-20 19:39'
updated_date: '2026-05-20 19:56'
labels:
  - refactor
  - word-index
dependencies: []
references:
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
  - CONTEXT.md
documentation:
  - backlog/decisions/ADR-0002-word-index-canonical-position.md
modified_files:
  - packages/core/src/word-index.ts
  - packages/core/src/__tests__/word-index.test.ts
  - packages/core/src/index.ts
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Foundation for ADR-0002 word-index refactor. Introduces the canonical position type and the deep module that owns all byte ↔ word translation.

Today the app stores positions as UTF-8 byte offsets and rebuilds a transient word index in the RSVP worker only. Every other surface (reader, highlights, sessions, glossary, search) reinvents byte arithmetic inline. This task lands the foundation: a single deep module + a branded type that downstream tasks consume.

Scope:
- New `WordPosition` brand type in `@lesefluss/core`. Replaces raw `number` for all position-bearing fields in downstream tasks.
- New `WordIndex` module in `@lesefluss/core`. Interface: build from content string, query word count, byte ↔ word conversion, words-between for session math, sub-word char index for highlight anchors, find-word-at-byte (binary search), serialize/deserialize for the persisted `book_content.word_index` column.
- Canonical tokenization rule documented in CONTEXT.md and implemented once here: split on `/(\s+)/` over UTF-8 plain text; hyphenated and dash-joined sequences stay as one word; `breakBefore` marks 2+ consecutive newlines.
- Unit tests over edge cases: empty content, single word, trailing whitespace, soft hyphens, em/en dashes, multi-byte UTF-8, breakBefore detection, round-trip byte→word→byte stability, char-in-word precision for Option A highlight anchors.

This task changes nothing downstream. Old byte-based code continues to work; nothing consumes `WordIndex` yet.

Reference: backlog/decisions/ADR-0002-word-index-canonical-position.md, CONTEXT.md (Word position, Word index, Tokenization rule).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 WordPosition branded type exported from @lesefluss/core, prevents passing a raw number where a word position is expected
- [x] #2 WordIndex module exposes: build(content), wordCount, byteOf(wordPos), wordOf(byteOffset), wordsBetween(a, b), wordAndCharOf(byteOffset) for sub-word precision, serialize/deserialize for storage
- [x] #3 Tokenization rule (/(\s+)/, hyphen-joined as single word, breakBefore on 2+ newlines) implemented once here and referenced from CONTEXT.md
- [x] #4 Unit tests cover empty content, single word, trailing whitespace, soft hyphens, em/en dashes, multi-byte UTF-8, breakBefore detection, round-trip byte→word→byte stability, sub-word char precision
- [x] #5 No downstream code is modified; this task introduces the module and types only
- [x] #6 Module is pure: no DB, no DOM, no IO
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

New module `packages/core/src/word-index.ts` introducing:

1. `WordPosition` brand type (`number & { readonly [wpBrand]: true }`) + `wordPos(n)` factory. Prevents raw `number` from passing where a word position is expected.

2. `WordIndex` class wrapping existing `buildWordIndex`/`findWordIndexAtOffset` logic from `engine.ts`. Internally holds `WordEntry[]` + cached `contentByteLength`. Interface:
   - `static build(content: string): WordIndex`
   - `static deserialize(serialized: SerializedWordIndex): WordIndex`
   - `serialize(): SerializedWordIndex` — JSON-friendly columnar shape `{ words: string[], byteOffsets: number[], breakBeforeMask: number[], contentByteLength: number }`
   - `wordCount: number`
   - `wordAt(pos: WordPosition): WordEntry`
   - `entries(): readonly WordEntry[]`
   - `byteOf(pos: WordPosition): number`
   - `wordOf(byteOffset: number): WordPosition` (binary search, clamped to bounds)
   - `wordsBetween(a: WordPosition, b: WordPosition): number` (integer subtraction)
   - `wordAndCharOf(byteOffset: number): { word: WordPosition, charInWord: number }` for Option A highlight anchors

3. Tests `packages/core/src/__tests__/word-index.test.ts` covering AC #4:
   - empty / single-word / trailing-whitespace
   - soft hyphen (`­`) keeps word intact
   - em / en dash do not split
   - multi-byte UTF-8 (ä, 🦋) — wordOf/byteOf roundtrip
   - `breakBefore` set when ≥2 newlines precede
   - roundtrip: `byteOf(wordOf(b)) ≤ b < byteOf(wordOf(b)+1)` for arbitrary b
   - `wordAndCharOf` returns char offset inside multi-char word
   - `wordsBetween` = subtraction
   - serialize → deserialize equivalence of query results

4. Existing `engine.ts` symbols (`buildWordIndex`, `findWordIndexAtOffset`, `WordEntry`) untouched. WordIndex calls them internally. Old call sites continue to work; switchover removes them in TASK-135.

5. Export from `packages/core/src/index.ts`.

6. Verify: `pnpm --filter @lesefluss/core test` + `pnpm --filter @lesefluss/core check-types`.

## Out of scope

Downstream consumption, schema, BLE seam, sync — all deferred to TASK-133 through TASK-137.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary

Foundation landed for ADR-0002 word-index refactor. Introduced canonical position type `WordPosition` (branded number) and `WordIndex` deep module in `@lesefluss/core`. Downstream code unchanged; nothing consumes the new module yet — that is TASK-135.

## Interface

`packages/core/src/word-index.ts`:
- `WordPosition = number & { readonly [brand]: true }` + `wordPos(n)` factory.
- `WordIndex` class:
  - `static build(content)` / `static deserialize(blob)`
  - `serialize(): SerializedWordIndex` — versioned columnar blob (content + byteOffsets + breakBefore bitmask)
  - `wordCount`, `wordAt(pos)`, `listEntries()`
  - `byteOf(pos)`, `wordOf(byteOffset)` (binary search, clamped)
  - `wordsBetween(a, b)` (absolute difference)
  - `wordAndCharOf(byteOffset)` (Option A sub-word precision; clamps whitespace to next-word char-0)

Reuses existing `buildWordIndex` from `engine.ts` for tokenization, so the canonical rule lives in exactly one place. Engine symbols untouched.

## Tests

36 unit tests in `packages/core/src/__tests__/word-index.test.ts`. Cover empty / single-word / trailing whitespace, hyphen-joined and dash-joined tokens, soft hyphen, multi-byte UTF-8 (ä, 🦋, é), breakBefore on ≥2 newlines, byte↔word roundtrip stability across every byte of a sample content, char-in-word precision including the café/é case, whitespace clamp behavior, and serialize→deserialize equivalence (including breakBefore).

## Verification

- `pnpm --filter @lesefluss/core test` → 36 passing
- `pnpm --filter @lesefluss/core check-types` → clean

## Out of scope (handled in downstream tasks)

- Drizzle schema for `book_content.word_index` → TASK-133
- App-start backfill sweep → TASK-134
- Reader / highlights / sessions / chapters / BLE switchover → TASK-135
- Cloud sync mirrored writes → TASK-136
- Byte-column drop → TASK-137
<!-- SECTION:FINAL_SUMMARY:END -->
