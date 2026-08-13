---
id: TASK-164.3
title: Book edit sheet
status: Done
assignee:
  - sch-28
created_date: '2026-08-13 09:05'
updated_date: '2026-08-13 21:11'
labels: []
milestone: m-5
dependencies:
  - TASK-164.1
documentation:
  - BOOK-MANAGEMENT.md
parent_task_id: TASK-164
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
There is no way to correct a book's metadata anywhere in the app. A PDF whose title parsed as "Microsoft Word - draft3.docx" keeps that title forever.

Build one reusable edit component covering title, author, description, language, status, rating, review and tags. The import confirm subtask mounts the same component, so keep it free of assumptions about editing a book that already exists in the database.

Status field offers the four values plus a way back to automatic (clears the column) whenever an override is set. Tags are a JSON array on the book row, entered as free text.

Needs a useUpdateBook mutation in services/db/hooks/use-books.ts, mirroring useDeleteBook: invalidate the detail and list queries, then scheduleSyncPush().

Depends on the columns from the phase 1 subtask.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A single edit component covers title, author, description, language, status, rating, review and tags
- [x] #2 The component works both for an existing book and for a not-yet-committed import payload
- [x] #3 Status offers want/reading/finished/dropped plus a reset-to-automatic action that is only shown when an override is set
- [x] #4 Rating is settable 1-5 and clearable back to unrated
- [x] #5 Tags are entered and removed as free text and persist as a JSON array on the book row
- [x] #6 useUpdateBook invalidates the book detail and list queries and schedules a sync push
- [x] #7 Saving an edit with no account and no network still persists locally
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
`BookEditValues` is deliberately not a `Book`: it carries only the eight editable fields, so the import confirm slice can mount the same sheet over a payload that has no row yet. AC #2 is met by construction and by two live call sites (detail page, library long-press); mounting it on an uncommitted payload happens in TASK-164.5.

Two UI decisions worth knowing: tapping the current star clears the rating (with a 'Tap again to clear' hint) rather than a separate clear control, and 'Reset to automatic' only appears once an override is set. When status is unset the sheet states what it derives to right now, e.g. 'Following your reading: Reading.'

A tag typed but never committed (no Enter, comma or blur) is folded in on save rather than silently dropped. Verified on device: typing `test-tag` and hitting Save straight away stored `["test-tag"]`.

`DetailShell.headerAction` now takes one action or an array. The single-action call site in series-detail.tsx is unchanged and still typechecks.

Verified end to end on device against a real book. Setting Dropped + 4 stars + a tag wrote status='dropped', rating=4, tags='["test-tag"]', and critically left word_position AND position_updated_at untouched while updated_at moved: the TASK-164.8 split holding under a real metadata edit. The book then appeared under the Dropped filter at 41% read, an explicit status outranking the derived one. Reopening the sheet reloaded the saved state, and clearing all three wrote NULLs back, leaving the row as found.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Book metadata is editable for the first time.

One `BookEditSheet` covers title, author, status, rating, tags, description, notes and language. It takes plain values and hands plain values back rather than talking to the database, so the import confirm slice can mount the same component over a payload that has no row yet.

Status offers the four shelves plus "Reset to automatic", which only appears once an override is set; with none set the sheet says what the reading position currently derives to. Rating clears by tapping the star again. Tags are free text, stored as the JSON array the `tags` column expects, and a tag left uncommitted in the input is folded in on save instead of being lost.

`useUpdateBook` mirrors `useDeleteBook`: invalidate the detail and list queries, then schedule a sync push. The write lands in SQLite regardless of account, so an edit made signed out is kept and carried up by `updated_at` whenever an account appears.

Entry points are the detail page header (Edit beside Delete, which needed `DetailShell.headerAction` widened to accept an array) and the library long-press sheet.

Verified on device against a real book: an edit wrote status, rating and tags while leaving the reading position and its stamp untouched, the book moved to the Dropped shelf despite being 41% read, and clearing every field wrote NULLs back.
<!-- SECTION:FINAL_SUMMARY:END -->
