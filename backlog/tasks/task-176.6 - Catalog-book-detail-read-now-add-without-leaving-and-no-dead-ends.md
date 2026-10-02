---
id: TASK-176.6
title: 'Catalog book detail: read now, add without leaving, and no dead ends'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:04'
updated_date: '2026-10-02 16:58'
labels:
  - explore
  - ux
dependencies: []
references:
  - apps/capacitor/src/pages/explore/book-detail.tsx
  - apps/capacitor/src/pages/_shared/detail-shell.tsx
documentation:
  - EXPLORE-SCOPE.md
modified_files:
  - apps/capacitor/src/pages/explore/book-detail.tsx
  - apps/capacitor/src/pages/explore/use-catalog-import.ts
  - apps/capacitor/src/pages/explore/import-toasts.ts
  - apps/capacitor/src/components/toast.tsx
  - apps/capacitor/e2e/explore-book-detail.spec.ts
  - apps/capacitor/e2e/helpers/catalog-mock.ts
  - apps/capacitor/e2e/import-catalog.spec.ts
parent_task_id: TASK-176
priority: high
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: on `/tabs/explore/book/$catalogId` the only action is "Download", which imports and then replaces the route with `/tabs/library`. The user wanted to read the book, not land in a list. When no EPUB exists, the page shows a disabled "Not available as free EPUB" button with no next step. A failed download opens a blocking AlertDialog with only "OK".

Outcome: the detail page supports both "start reading now" and "save for later", and every failure has a next step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A 'Read now' action imports the book if needed and opens it in the reader
- [x] #2 An 'Add to library' action imports and keeps the user on the detail page with a confirmation that offers to open the book
- [x] #3 When the book is already in the library, the primary action opens it (existing behaviour preserved)
- [x] #4 When no EPUB is available, the page offers the source link and does not present a disabled primary button as the only action
- [x] #5 Download failures show a non-blocking error with Retry, matching the web-novel import toast pattern
- [x] #6 Tests cover read now, add and stay, already-in-library, no-EPUB and failure-retry
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. `useCatalogImport()` hook (shared with 176.7 quick add): wraps `importFromCatalog`, progress, invalidations, sync push.
2. Detail actions: not in library + EPUB -> primary 'Read now' (import, then push `/tabs/reader/$id`), secondary 'Add to library' (import, stay, success toast with 'Open' action). In library -> 'Open in Library' (unchanged). No EPUB -> primary opens the source page via Browser, with a 'Not available as a free EPUB' fact; no disabled-only button.
3. Failures: drop AlertDialog; `toast.error` with a Retry action that re-runs the same intent. Toast wrapper gains an optional `action`.
4. No reader changes.
5. Tests: Playwright E2E with mocked catalog (existing pattern in e2e/helpers/catalog-mock.ts): read now, add and stay, already-in-library, no-EPUB, failure-retry. Update import-catalog.spec for the renamed action.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read now imports then pushes /tabs/reader/$id (back returns to the detail page, now showing Open in Library). Add to library stays and toasts with an Open action. No EPUB: primary 'Read on Project Gutenberg/Standard Ebooks' via Browser.open plus a 'No free EPUB' fact. Failures: toast.error with Retry re-running the same intent; AlertDialog removed. toast wrapper gained an optional action (6s duration when present). No reader changes.

E2E: e2e/explore-book-detail.spec.ts (5 specs) + catalog-mock gains hasEpub/epubFailures; import-catalog.spec updated for the renamed action. All catalog E2E pass. Full E2E run: 79 passed, 1 failed (highlights-edit-delete 'delete persists across reload'), which also fails with my toast change reverted, so unrelated to this task.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Catalog detail offers Read now (import + open reader) and Add to library (import, stay, confirm with Open). In-library books keep Open in Library. Books without an EPUB link to their source instead of a dead button. Download failures are a non-blocking toast with Retry. Five Playwright specs cover read now, add and stay, already-in-library, no-EPUB and failure-retry.
<!-- SECTION:FINAL_SUMMARY:END -->
