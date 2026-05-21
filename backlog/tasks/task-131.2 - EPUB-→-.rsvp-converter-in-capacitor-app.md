---
id: TASK-131.2
title: EPUB → .rsvp converter in capacitor app
status: Done
assignee: []
created_date: '2026-05-20 22:19'
updated_date: '2026-05-21 22:19'
labels: []
milestone: m-12
dependencies: []
parent_task_id: TASK-131
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the rsvpnano .rsvp file format generator into the capacitor app so book uploads to rsvpnano devices can happen headlessly without sending the user to the browser-based converter.

Reference impl: apps/rsvpnano/tools/epub_to_rsvp.py and apps/rsvpnano/src/storage/EpubConverter.cpp:2606-2615 for the header schema.

Format:
- Header directive lines: `@rsvp <ver>`, `@title`, `@author`, `@source`, `@converter`, `@chapter`
- Body: wrapped UTF-8 text; lines beginning with literal `@` in body content escaped as `@@`

Lesefluss already extracts book text via @lesefluss/book-import. This task wraps that pipeline output into the .rsvp envelope. Plain-text and chapter boundaries should be preserved if the source has them.

Lives in packages/book-import or a new packages/rsvp-format depending on scope — prefer extending book-import if the existing API surface fits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a parsed book (title, author, chapters[], text), produces a UTF-8 string conforming to the .rsvp schema
- [ ] #2 Round-trip test: convert -> upload to rsvpnano -> on-device reader displays title/author/chapter correctly
- [x] #3 Handles @-escape edge case (text lines starting with @)
- [x] #4 Unit tests cover header generation, chapter directive placement, and @-escape
- [x] #5 No native deps; runs in browser and on capacitor runtime
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pure-TS port of the rsvpnano `.rsvp` document generator (ref: apps/rsvpnano/tools/epub_to_rsvp.py).

New module:
- `services/rsvp-format/builder.ts`: exports `buildRsvpDocument({title, author?, source?, body, chapters?})` → `Uint8Array`. Emits `@rsvp 1` + `@title` + optional `@author` / `@source` headers, then one `@chapter <title>` block per chapter sliced from `body[startByte..nextStartByte)`. Body lines starting with literal `@` get `@@` escape. Empty chapter titles fall back to "Chapter N". No native deps; runs in browser and on capacitor.
- `services/rsvp-format/__tests__/builder.test.ts`: 11 unit tests covering header generation, single synthetic chapter fallback, multi-chapter body slicing, sort-by-startByte, @-escape (mid-body + start-of-body), directive payload sanitization, "Chapter N" fallback, UTF-8 round-trip.

Integration:
- `contexts/book-sync-context.tsx`: replaces the inline `buildRsvpDocument` helper. Multi-book transfer path now parses `bookContent.chapters` (JSON column) and passes the chapter array to the new builder so the device shows real chapter boundaries instead of one monolithic `@para`.
- Books without parsed chapters: builder emits a single synthetic `@chapter <book title>` block (firmware always sees at least one directive).

Hardware round-trip (AC #2) requires user verification on device. tsc + 214 tests green.
<!-- SECTION:FINAL_SUMMARY:END -->
