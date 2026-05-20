---
id: TASK-131.11
title: 'Upload dialog: category selector + auto-open on multi-book'
status: To Do
assignee: []
created_date: '2026-05-20 18:00'
labels: []
dependencies:
  - TASK-131.9
parent_task_id: TASK-131
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Adapt the existing TransferModal so multi-book uploads carry an explicit category and trigger an auto-open on success.

Category selector:
- Add a radio (Book / Article) to the confirm phase of TransferModal.
- Default: Book.
- Stored per-upload (not persisted on the book record). Per D11.
- Hidden / not rendered when connected device is single-book (category is meaningless there).

Plumb-through:
- `transferBook(bookId, onProgress, category)` gains a category parameter (`"book" | "article"`, default `"book"`).
- BookSyncContext multi-book branch passes the category to `adapter.transferFile({ filename: '{bookId}.rsvp', category, sizeBytes })`.
- The filename is `{bookId}.rsvp` regardless of category; firmware places it under the matching directory.

Auto-open (D2):
- On multi-book transfer success, write the `active` characteristic with the new book's hash.
- Compute the hash client-side via `computeOnDeviceHash(bookId, category)` (TASK-131.9).
- Surface error on `active` write but do not retry; user can pick from the device library section in settings.

Hash side note:
- TASK-131.9's helper must accept `category` so the hash matches the right SD path.

Out of scope:
- Per-book persistent category field on lesefluss book records (defer; per-upload is fine for now).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TransferModal confirm phase shows a Book/Article radio only when connected to multi-book device
- [ ] #2 Selected category propagates through `transferBook` and into the BLE transfer header
- [ ] #3 Filename on device is always `{bookId}.rsvp`; firmware places it under `/books/books` or `/books/articles` per category
- [ ] #4 After a successful multi-book upload, the device's `active` characteristic is written with the new book's hash automatically
- [ ] #5 Single-book transfer flow unchanged in behavior and UI
<!-- AC:END -->
