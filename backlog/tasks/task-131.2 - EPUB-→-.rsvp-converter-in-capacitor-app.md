---
id: TASK-131.2
title: EPUB → .rsvp converter in capacitor app
status: To Do
assignee: []
created_date: '2026-05-20 22:19'
labels: []
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
- [ ] #1 Given a parsed book (title, author, chapters[], text), produces a UTF-8 string conforming to the .rsvp schema
- [ ] #2 Round-trip test: convert -> upload to rsvpnano -> on-device reader displays title/author/chapter correctly
- [ ] #3 Handles @-escape edge case (text lines starting with @)
- [ ] #4 Unit tests cover header generation, chapter directive placement, and @-escape
- [ ] #5 No native deps; runs in browser and on capacitor runtime
<!-- AC:END -->
