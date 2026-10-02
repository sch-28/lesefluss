---
id: TASK-176.10
title: 'Explore telemetry: searches, zero-result queries and imports'
status: To Do
assignee: []
created_date: '2026-10-01 10:05'
updated_date: '2026-10-02 16:59'
labels:
  - explore
  - telemetry
milestone: m-14
dependencies: []
documentation:
  - EXPLORE-SCOPE.md
parent_task_id: TASK-176
priority: low
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: there is no signal on what people search for in Explore, what returns nothing, or what they import from where. Zero-result queries are the best input for genre/tag and catalog gaps. The app already has an anonymous telemetry endpoint (`telemetry_events` / `/api/telemetry`).

Outcome: Explore usage is visible in telemetry without collecting personal data.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Zero-result searches are recorded with the normalized query, active filters and surface (catalog or web novels)
- [ ] #2 Imports from Explore are recorded with source (catalog/provider) and entry point (shelf, search, detail, quick add)
- [ ] #3 No account id, device id or free text beyond the search query is sent
- [ ] #4 Events respect the existing telemetry opt-out
- [ ] #5 A documented query shows top zero-result searches for the last 30 days
<!-- AC:END -->
