---
id: TASK-100
title: Cover image storage optimization (resize + compress)
status: To Do
assignee: []
created_date: '2026-04-26 11:29'
updated_date: '2026-04-30 21:49'
labels:
  - performance
  - storage
  - images
milestone: m-4
dependencies: []
documentation:
  - doc-1
  - doc-2
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cover images (book + upcoming series) are stored as base64 data URLs in `books.cover_image` / `series.cover_image` with no resizing or compression. Source images can be 500KB+ each, which bloats SQLite, sync payloads, and memory.

Add a single image-normalization utility that all import paths run covers through before commit:
- Resize to a sensible max (e.g. 400px on the longest edge — covers display small).
- Re-encode to WebP (or JPEG fallback) with tuned quality.
- Target: &lt;30KB per cover.

Apply in `apps/capacitor/src/services/book-import/commit.ts` and the new `commitSeries` path. Also consider a one-time migration to shrink existing oversized covers in user DBs.

Out of scope: glossary avatars (Task-99 covers those separately).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Single shared image-normalization helper used by both book and series imports
- [ ] #2 Covers are resized to a documented max dimension and re-encoded with compression
- [ ] #3 New imports produce covers under target size budget
- [ ] #4 Existing oversized covers are migrated or a follow-up task is filed for the migration
- [ ] #5 No visible quality regression on book/series cards or detail screens
<!-- AC:END -->
