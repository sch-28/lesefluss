---
id: TASK-98
title: Book language metadata for hyphenation
status: To Do
assignee: []
created_date: '2026-04-26 19:51'
updated_date: '2026-05-01 15:36'
labels: []
milestone: m-5
dependencies: []
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Books currently have no `language` field on the SQLite schema, so PageView's columns container hardcodes `lang="en"` (TODO marker in page-view.tsx). Hyphenation quality on non-English books suffers (English break rules applied to German / French / etc).

Plumbing required:
1. `apps/capacitor/src/services/db/schema.ts` — add `language: text("language")` column to `books` (BCP 47 tag, e.g. "en", "de", "fr"). Migration.
2. `apps/web/src/db/schema.ts` — mirror on syncBooks. Migration.
3. `packages/core/src/sync.ts` — add `language: z.string().nullable().optional()` to `SyncBookSchema`.
4. Import paths to populate it:
   - Catalog imports already get `language` from the catalog API — wire it through (apps/capacitor/src/services/catalog/client.ts already returns it).
   - EPUB import — extract `<dc:language>` from the OPF.
   - Local TXT/HTML imports — leave null (default).
5. PageView consumes `book.language ?? "en"` for the `lang` attribute on the columns container.
<!-- SECTION:DESCRIPTION:END -->
