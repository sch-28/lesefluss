---
id: TASK-164.5
title: Confirm and edit an import before it lands
status: To Do
assignee: []
created_date: '2026-08-13 09:05'
updated_date: '2026-08-13 09:06'
labels: []
milestone: m-4
dependencies:
  - TASK-164.3
documentation:
  - BOOK-MANAGEMENT.md
parent_task_id: TASK-164
priority: high
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imports commit straight to the database with whatever the parser guessed. That guess is worst exactly where it is hardest to undo: clipboard text, extracted web pages, and PDFs.

Split parse from commit and show a confirm sheet holding the parsed metadata, so the user can fix it before the book exists. runImportPipeline already returns a BookPayload and commitBook is the single writer (services/book-import/), so the seam is clean.

Staging must live in a provider mounted at routes/__root.tsx, not in the library page: ShareIntentHandler is root-level and fires on cold start, and catalog imports run from Explore, so a page-owned sheet would miss both.

Knock-on effects to handle:
- The invalidate + scheduleSyncPush() in useBookImportMutation (services/db/hooks/use-books.ts:100) belongs to the commit step now, not to a successful parse.
- The "Imported: X" toasts in components/share-intent-handler.tsx fire on parse success today and need to move; the sheet is the feedback.
- importFromCatalog (services/catalog/import.ts) keeps committing directly. Catalog metadata is curated and onboarding imports several starter books at once, which would otherwise queue up sheets during first run.
- Serial/web-novel imports are out of scope: they create a series plus N chapter rows, a different shape.

Reuses the edit component from the edit sheet subtask.

Absorbs TASK-92.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Parsing and committing an import are separate steps, with commitBook still the single writer
- [ ] #2 Staging state and the confirm sheet live in a provider mounted at the router root
- [ ] #3 File picker, clipboard, URL and Android share-intent imports all show the confirm sheet, including a share received on cold start
- [ ] #4 Catalog imports from Explore and from onboarding commit directly with no sheet
- [ ] #5 Confirming applies the user's edits to the committed book and only then invalidates the library queries and schedules a sync push
- [ ] #6 Cancelling commits nothing and releases the staged payload, including the original file bytes
- [ ] #7 Navigating away with a sheet open does not leave the payload retained
- [ ] #8 Serial/web-novel imports are unchanged
- [ ] #9 Import error paths (CANCELLED, TOO_LARGE, PDF_ENCRYPTED, ...) still surface their existing toasts and alerts
<!-- AC:END -->
