---
id: TASK-164
title: 'Book management: editable metadata, status, rating, tags'
status: Done
assignee: []
created_date: '2026-08-13 09:04'
updated_date: '2026-08-13 23:21'
labels: []
milestone: m-5
dependencies: []
documentation:
  - BOOK-MANAGEMENT.md
priority: high
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Parent task for the book management workstream. Books are write-once today: whatever the importer guessed for title/author is permanent, there is no description/rating/status/tags, and reading status is derived purely from reading position so "dropped" cannot be expressed.

Full scope, decisions and rationale live in BOOK-MANAGEMENT.md at the repo root. Read it before starting any subtask.

Key decisions (do not re-litigate):
- Status is sticky-manual: `status` column nullable, NULL = derive from progress, non-null = user set it and it never changes on its own.
- Statuses are want / reading / finished / dropped. No "paused".
- Tags are a JSON array column on `books`, not separate tables — they ride the existing book-row last-write-wins sync.
- Import confirm applies to file/clipboard/URL/share imports, never to catalog imports (Explore + onboarding).
- Deferred out of this workstream: cover editing, bulk/multi-select actions, collections, confirm step for serial imports.

Subtasks must be done in order: phase 1 is the sync foundation and everything else depends on it.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Books stopped being write-once.

A reader can now correct what the importer guessed and record what they thought: title, author, description, language, a shelf (want / reading / finished / dropped), a half-star rating, free-form tags and private notes. Imports show a confirm sheet before anything is written, the detail page and the library surface all of it, the library can be searched and filtered by tag, and the website's profile shows the same. Ten subtasks; TASK-92 (preview before importing) and TASK-98 (language column) are absorbed.

The load-bearing work was underneath. `books` gained a real `updated_at`, and the reader-editable fields gained `metadata_updated_at`, because every released build reads `updated_at` as the reading position's revision: a metadata edit moving it would make older devices discard unpushed reading. Two review rounds were needed to get that split the right way round, and a third to stop a legacy push laundering a stale position through it.

Four data-loss bugs were found by review and fixed before shipping: metadata erased during rollout by a client that never heard of the columns; the reading position rolled back by a rating; a long paste 400ing the entire sync payload and silently stopping sync for every entity type; and a second import silently discarding the first. All four are covered by falsifiable tests.

CI now runs the server merge SQL against a real Postgres, replaying the migration chain from scratch. Two of those four bugs lived in exactly that SQL, which until now executed on no machine but the author's.

Deferred as planned: cover editing, bulk actions, collections, and a confirm step for serial imports.

Not yet done: deploy. Production has none of the seven migrations, and the website's profile page has not been seen rendering against a migrated database. The Android share-intent path is wired identically to the others but could not be driven from adb.
<!-- SECTION:FINAL_SUMMARY:END -->
