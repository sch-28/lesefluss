---
id: TASK-99
title: Custom avatar images for glossary entries
status: To Do
assignee: []
created_date: '2026-04-27 21:40'
labels: []
milestone: m-5
dependencies:
  - TASK-54
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-54. Allow users to attach a custom image to a glossary entry instead of (or alongside) the auto-generated color/initials avatar.

## Scope

- Image picker on the entry card (native: `@capawesome/capacitor-file-picker`; web: HTML5 file input — same pattern as book import).
- Simple square crop UI before save.
- Store as base64 on the entry row (or as a separate `glossary_entry_images` row if size is a concern). Mirror the cover-image storage pattern.
- Sync the image as part of the glossary sync payload (push once per entry, like book content/cover).
- Fall back to the auto-generated avatar when no image is set.
- "Remove image" action restores the auto avatar.

## Out of scope

- Multi-image galleries per entry.
- AI-generated portraits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 User can pick and crop a square image for a glossary entry on native and web
- [ ] #2 Image is persisted in SQLite + Postgres and round-trips through full-snapshot sync
- [ ] #3 Entry card and Glossary list use the custom image when present, fall back to the auto avatar otherwise
- [ ] #4 'Remove image' restores the auto-generated avatar
<!-- AC:END -->
