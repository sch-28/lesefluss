---
id: TASK-148
title: >-
  RSVP v2 file format: ship pre-tokenized word list; device skips local
  tokenizer for v2 uploads
status: To Do
assignee: []
created_date: '2026-05-21 22:43'
labels: []
milestone: m-12
dependencies:
  - TASK-147
priority: high
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Definitive fix for the app ↔ device tokenizer drift problem (TASK-143 closed but the gap remained because firmware Latin8 encoding diverges from our TS approximation by ~40-50 words on Frankenstein, even with scaling).

Design: instead of shipping the raw book body and letting the device tokenize, ship the canonical word list pre-tokenized by the app. Device fills its `WordRecord[]` directly from the list, skipping `appendTokenizedLineWords`. By construction, app and device share the exact same word stream.

Why this works:
- Device's runtime reading model is word-by-word (it reads WordRecord[i] from the indexed book store). After indexing, the source body is no longer used at read time.
- The tokenize-on-index step is the only place that consumes source bytes.
- Skipping that step + populating WordRecord[] from the shipped list means device and app see identical word indices for the same book.

`.rsvp` v2 format:
- Header: `@rsvp 2`, `@title`, `@author`, `@source` (unchanged from v1).
- Word list: either text directives (`@word <text>` per line, simple but bigger) or a binary block. Recommend binary: `[wordCount: u32][lengths: u16[]][word data: concatenated UTF-8...]`.
- Chapter markers: `@chapter <title> <wordIndex>` (or in the binary header).
- Paragraph markers: `@para <wordIndex>` (or packed binary array).
- No body bytes. The device's data blob is reconstructed from the word list at index time.

Size estimate: Frankenstein ≈ 470KB (similar to current v1 442KB; whitespace savings offset per-word metadata). No upload-time regression.

App builder changes:
- `apps/capacitor/src/services/rsvp-format/builder.ts`: branch on a `useV2` flag (or always emit v2 for new uploads). Run app's WordIndex over content, emit word list + paragraph offsets + chapter word-indices.

Firmware changes (lives on `lesefluss-ble` fork branch, not upstream):
- `apps/rsvpnano/src/storage/StorageManager.cpp::buildIndexedBook`: detect `@rsvp 2` header. v2 path reads word table + chapter + paragraph markers directly, populates WordRecord[] and the data blob. v1 path unchanged (preserves sideload of upstream-format .rsvp files).
- File version stored in the IndexedBookStore::Header so downstream code knows.

Sync side effects (positive):
- `scaleWord`/`lookupDeviceWordCount` helpers in `book-sync-context.tsx` become no-ops for v2 books (counts always match). Could keep scaling as fallback for v1-sideloaded books or remove if v1 sync isn't expected.

Out of scope:
- Highlights / annotations stored on the device side (device is word-only in its reading model; no char-level data needed).
- Removing v1 support (sideload of upstream-format files must keep working).

Depends on TASK-147 (BLE transfer throughput) shipping first so the modest size delta from v2 isn't compounded by today's 10-min upload bug.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/.../builder.ts emits @rsvp 2 with a pre-tokenized word list, paragraph + chapter markers, and no body bytes
- [ ] #2 rsvpnano firmware detects @rsvp 2 and populates WordRecord[] from the shipped word list, skipping appendTokenizedLineWords; v1 sideload path remains functional
- [ ] #3 Frankenstein upload via app + open on device: device's wordCount === app's wordCount exactly, and every word index displays the same word on both sides
- [ ] #4 scaleWord helpers in book-sync-context become unnecessary for v2 books (or kept only as a v1-fallback path)
- [ ] #5 Upload time for Frankenstein after both TASK-147 and this change lands in under 90 seconds
- [ ] #6 Sideload of an upstream-format (.rsvp v1) file still works
<!-- AC:END -->
